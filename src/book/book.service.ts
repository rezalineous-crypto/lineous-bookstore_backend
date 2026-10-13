/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { Book, Role, BookStatus, AttachmentType } from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { BookSuccessMessages } from '../common/validators/book.validators';

@Injectable()
export class BookService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new book with optional thumbnail and attachments
   * Security: Admins only
   */
  async create(
    dto: CreateBookDto,
    requestingUserRole: Role,
    thumbnail?: Express.Multer.File,
    attachments?: Express.Multer.File[],
    cloudinaryService?: CloudinaryService,
  ): Promise<{
    message: string;
    status: string;
    data: Book;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can create books');
    }

    // Check if slug already exists
    const existingBook = await this.prisma.book.findUnique({
      where: { slug: dto.slug },
    });

    if (existingBook) {
      throw new ConflictException('Book with this slug already exists');
    }

    // Validate publication exists
    const publication = await this.prisma.publication.findUnique({
      where: { id: dto.publicationId },
    });
    if (!publication) {
      throw new NotFoundException('Publication not found');
    }

    // Validate subject exists and belongs to the publication
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (subject.publicationId && subject.publicationId !== dto.publicationId) {
      throw new ConflictException(
        'Subject does not belong to the selected publication',
      );
    }

    // Handle thumbnail upload
    let thumbnailUrl: string | undefined;
    let thumbnailPublicId: string | undefined;

    if (thumbnail && cloudinaryService) {
      const result = await cloudinaryService.uploadFile(
        thumbnail,
        'bookstore/thumbnails',
      );
      thumbnailUrl = result.url;
      thumbnailPublicId = result.publicId;
    }

    // Create the book (without price/stock/isbn - those go to papers)
    const book = await this.prisma.book.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        shortDescription: dto.shortDescription,
        description: dto.description,
        publicationDate: dto.publicationDate
          ? new Date(dto.publicationDate)
          : undefined,
        edition: dto.edition,
        language: dto.language,
        status: dto.status || BookStatus.DRAFT,
        thumbnail: thumbnailUrl || dto.thumbnail,
        publicationId: dto.publicationId,
        subjectId: dto.subjectId,
      },
      include: {
        publication: true,
        subject: true,
      },
    });

    // Handle additional attachments
    if (attachments && attachments.length > 0 && cloudinaryService) {
      for (const file of attachments) {
        const result = await cloudinaryService.uploadFile(
          file,
          'bookstore/attachments',
        );
        await this.prisma.bookAttachment.create({
          data: {
            bookId: book.id,
            url: result.url,
            publicId: result.publicId,
            type: AttachmentType.IMAGE,
            sortOrder: 0,
          },
        });
      }
    }

    // If thumbnail was uploaded, also create a BookAttachment for it
    if (thumbnailUrl && thumbnailPublicId && cloudinaryService) {
      await this.prisma.bookAttachment.create({
        data: {
          bookId: book.id,
          url: thumbnailUrl,
          publicId: thumbnailPublicId,
          type: AttachmentType.THUMBNAIL,
          sortOrder: 0,
        },
      });
    }

    // Assign categories if provided
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      await this.prisma.bookCategory.createMany({
        data: dto.categoryIds.map((categoryId) => ({
          bookId: book.id,
          categoryId,
        })),
      });
    }

    return {
      message: BookSuccessMessages.CREATED,
      status: 'success',
      data: book,
    };
  }

  /**
   * Get all books
   * Security: Public
   */
  async findAll(
    requestingUserRole?: Role,
    subjectId?: string,
    categoryId?: string,
  ): Promise<{
    message: string;
    status: string;
    data: Book[];
  }> {
    // Soft-deleted books are never returned, for any role. Admins see all
    // non-deleted books (any status); everyone else sees published only.
    const where: any =
      requestingUserRole === Role.ADMIN
        ? { deletedAt: null }
        : { deletedAt: null, status: BookStatus.PUBLISHED };

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (categoryId) {
      where.categories = { some: { categoryId } };
    }

    const books = await this.prisma.book.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        publication: true,
        subject: true,
        papers: {
          where: { deletedAt: null },
        },
        attachments: true,
        reviews: true,
      },
    });

    const booksWithPriceRange = books.map((book) => ({
      ...book,
      priceRange: this.calculatePriceRange(book.papers),
    }));

    return {
      message:
        booksWithPriceRange.length > 0
          ? BookSuccessMessages.RETRIEVED_ALL
          : BookSuccessMessages.NOT_FOUND,
      status: 'success',
      data: booksWithPriceRange,
    };
  }

  /**
   * Get a single book by ID
   * Security: Public
   */
  async findOne(
    id: string,
    requestingUserRole?: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Book & {
      priceRange: { min: number; max: number; display: string } | null;
    };
  }> {
    const where = {
      id,
      deletedAt: null,
      ...(requestingUserRole === Role.ADMIN
        ? {}
        : { status: BookStatus.PUBLISHED }),
    };

    const book = await this.prisma.book.findUnique({
      where,
      include: {
        publication: true,
        subject: true,
        papers: true,
        attachments: true,
        reviews: true,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const bookWithPriceRange = {
      ...book,
      priceRange: this.calculatePriceRange(book.papers),
    } as Book & {
      priceRange: { min: number; max: number; display: string } | null;
    };

    return {
      message: BookSuccessMessages.RETRIEVED,
      status: 'success',
      data: bookWithPriceRange,
    };
  }

  /**
   * Update a book with optional thumbnail and attachments
   * Security: Admins only
   */
  async update(
    id: string,
    dto: UpdateBookDto,
    requestingUserRole: Role,
    thumbnail?: Express.Multer.File,
    attachments?: Express.Multer.File[],
    cloudinaryService?: CloudinaryService,
  ): Promise<{
    message: string;
    status: string;
    data: Book;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can update books');
    }

    const existingBook = await this.prisma.book.findUnique({
      where: { id },
    });

    if (!existingBook) {
      throw new NotFoundException('Book not found');
    }

    // If slug is being changed, check if it's already taken
    if (dto.slug && dto.slug !== existingBook.slug) {
      const slugExists = await this.prisma.book.findUnique({
        where: { slug: dto.slug },
      });

      if (slugExists) {
        throw new ConflictException('Slug already in use');
      }
    }

    // Handle thumbnail upload
    let thumbnailUrl: string | undefined;
    let thumbnailPublicId: string | undefined;

    if (thumbnail && cloudinaryService) {
      const result = await cloudinaryService.uploadFile(
        thumbnail,
        'bookstore/thumbnails',
      );
      thumbnailUrl = result.url;
      thumbnailPublicId = result.publicId;
    }

    // Build update data object - only include fields that are provided
    const updateData: Record<string, unknown> = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.shortDescription !== undefined)
      updateData.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.publicationDate !== undefined)
      updateData.publicationDate = new Date(dto.publicationDate);
    if (dto.edition !== undefined) updateData.edition = dto.edition;
    if (dto.language !== undefined) updateData.language = dto.language;
    if (dto.status !== undefined) updateData.status = dto.status;
    // If new thumbnail uploaded, use it; otherwise use the provided URL
    if (thumbnailUrl) {
      updateData.thumbnail = thumbnailUrl;
    } else if (dto.thumbnail !== undefined) {
      updateData.thumbnail = dto.thumbnail;
    }
    if (dto.publicationId !== undefined)
      updateData.publicationId = dto.publicationId;
    if (dto.subjectId !== undefined) updateData.subjectId = dto.subjectId;

    const book = await this.prisma.book.update({
      where: { id },
      data: updateData,
      include: {
        publication: true,
        subject: true,
        attachments: true,
      },
    });

    // Handle additional attachments
    if (attachments && attachments.length > 0 && cloudinaryService) {
      for (const file of attachments) {
        const result = await cloudinaryService.uploadFile(
          file,
          'bookstore/attachments',
        );
        await this.prisma.bookAttachment.create({
          data: {
            bookId: book.id,
            url: result.url,
            publicId: result.publicId,
            type: AttachmentType.IMAGE,
            sortOrder: 0,
          },
        });
      }
    }

    // If thumbnail was uploaded, also create a BookAttachment for it
    if (thumbnailUrl && thumbnailPublicId && cloudinaryService) {
      await this.prisma.bookAttachment.create({
        data: {
          bookId: book.id,
          url: thumbnailUrl,
          publicId: thumbnailPublicId,
          type: AttachmentType.THUMBNAIL,
          sortOrder: 0,
        },
      });
    }

    // Update category assignments if provided
    if (dto.categoryIds !== undefined) {
      await this.prisma.bookCategory.deleteMany({
        where: { bookId: book.id },
      });

      if (dto.categoryIds.length > 0) {
        await this.prisma.bookCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({
            bookId: book.id,
            categoryId,
          })),
        });
      }
    }

    return {
      message: BookSuccessMessages.UPDATED,
      status: 'success',
      data: book,
    };
  }

  /**
   * Delete a book (soft delete)
   * Security: Admins only
   */
  async remove(
    id: string,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: null;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can delete books');
    }

    const book = await this.prisma.book.findUnique({
      where: { id, deletedAt: null },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Soft delete
    await this.prisma.book.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return {
      message: BookSuccessMessages.DELETED,
      status: 'success',
      data: null,
    };
  }

  /**
   * Get books in tree structure: categories > publications > subjects > books
   * Security: Public (returns only active, published books)
   *
   * A book is nested under every category it is assigned to (via BookCategory),
   * so a book linked to multiple categories appears under each one.
   * When `categoryId` is supplied, only that category is returned at the top
   * level and books are nested solely under it.
   * Books with no category assignment are not included in the tree.
   */
  async getTree(categoryId?: string) {
    // Fetch all published books once, with their categories, publication,
    // subject and papers, then group in memory. This avoids the nested
    // per-publication/per-subject queries of the previous implementation.
    const books = await this.prisma.book.findMany({
      where: {
        deletedAt: null,
        status: BookStatus.PUBLISHED,
        ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        publication: true,
        subject: true,
        papers: { where: { deletedAt: null } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // category -> publication -> subject -> books
    const categoryMap = new Map<
      string,
      {
        category: {
          id: string;
          name: string;
          slug: string;
          isHidden: boolean;
          displayOrder: number;
          icon: string | null;
          route: string | null;
        };
        publications: Map<
          string,
          {
            publication: {
              id: string;
              name: string;
              slug: string;
              isActive: boolean;
            };
            subjects: Map<
              string,
              {
                subject: {
                  id: string;
                  name: string;
                  slug: string;
                  isActive: boolean;
                };
                books: {
                  id: string;
                  title: string;
                  slug: string;
                  priceRange: {
                    min: number;
                    max: number;
                    display: string;
                  } | null;
                  thumbnail: string | null;
                }[];
              }
            >;
          }
        >;
      }
    >();

    for (const book of books) {
      const bookEntry = {
        id: book.id,
        title: book.title,
        slug: book.slug,
        priceRange: this.calculatePriceRange(book.papers),
        thumbnail: book.thumbnail,
      };

      // When filtering by a specific category, only nest the book under that
      // category rather than every category it belongs to.
      const categoryAssignments = categoryId
        ? book.categories.filter((c) => c.categoryId === categoryId)
        : book.categories;

      for (const assignment of categoryAssignments) {
        const cat = assignment.category;
        if (!cat) continue;

        let catNode = categoryMap.get(cat.id);
        if (!catNode) {
          catNode = {
            category: {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              isHidden: cat.isHidden,
              displayOrder: cat.displayOrder,
              icon: cat.icon,
              route: cat.route,
            },
            publications: new Map(),
          };
          categoryMap.set(cat.id, catNode);
        }

        const publication = book.publication;
        const subject = book.subject;
        if (!publication || !subject) continue;

        let pubNode = catNode.publications.get(publication.id);
        if (!pubNode) {
          pubNode = {
            publication: {
              id: publication.id,
              name: publication.name,
              slug: publication.slug,
              isActive: publication.isActive,
            },
            subjects: new Map(),
          };
          catNode.publications.set(publication.id, pubNode);
        }

        let subjNode = pubNode.subjects.get(subject.id);
        if (!subjNode) {
          subjNode = {
            subject: {
              id: subject.id,
              name: subject.name,
              slug: subject.slug,
              isActive: subject.isActive,
            },
            books: [],
          };
          pubNode.subjects.set(subject.id, subjNode);
        }

        subjNode.books.push(bookEntry);
      }
    }

    // Serialize the maps into the nested array structure.
    const result: {
      category: {
        id: string;
        name: string;
        slug: string;
        isHidden: boolean;
        displayOrder: number;
        icon: string | null;
        route: string | null;
      };
      publications: {
        publication: {
          id: string;
          name: string;
          slug: string;
          isActive: boolean;
        };
        subjects: {
          subject: {
            id: string;
            name: string;
            slug: string;
            isActive: boolean;
          };
          books: {
            id: string;
            title: string;
            slug: string;
            priceRange: {
              min: number;
              max: number;
              display: string;
            } | null;
            thumbnail: string | null;
          }[];
        }[];
      }[];
    }[] = [];

    const sortedCategories = Array.from(categoryMap.values()).sort(
      (a, b) =>
        (a.category.displayOrder ?? 0) - (b.category.displayOrder ?? 0) ||
        a.category.name.localeCompare(b.category.name),
    );

    for (const catNode of sortedCategories) {
      const sortedPubs = Array.from(catNode.publications.values()).sort(
        (a, b) => a.publication.name.localeCompare(b.publication.name),
      );

      const publications = sortedPubs.map((pubNode) => {
        const sortedSubjects = Array.from(pubNode.subjects.values()).sort(
          (a, b) => a.subject.name.localeCompare(b.subject.name),
        );

        return {
          publication: pubNode.publication,
          subjects: sortedSubjects.map((subjNode) => ({
            subject: subjNode.subject,
            books: subjNode.books,
          })),
        };
      });

      result.push({
        category: catNode.category,
        publications,
      });
    }

    return {
      message:
        result.length > 0
          ? 'Books tree retrieved successfully'
          : 'No books found',
      status: 'success',
      data: result,
    };
  }

  private calculatePriceRange(papers: any[]): {
    min: number;
    max: number;
    display: string;
  } | null {
    if (!papers || papers.length === 0) return null;

    const now = new Date();
    const effectivePrices = papers.map((paper) => {
      const basePrice = Number(paper.price);
      if (
        paper.discountPrice &&
        paper.discountStartDate &&
        paper.discountEndDate &&
        now >= paper.discountStartDate &&
        now <= paper.discountEndDate
      ) {
        return Number(paper.discountPrice);
      }
      return basePrice;
    });

    if (effectivePrices.length === 0) return null;

    const min = Math.min(...effectivePrices);
    const max = Math.max(...effectivePrices);

    return {
      min,
      max,
      display: min === max ? `৳${min}` : `From ৳${min}`,
    };
  }
}
