/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { BookStatus, Category, Role } from '@prisma/client';

/** Book entry in the navigation menu tree (title + link identifiers only) */
export interface MenuBook {
  id: string;
  title: string;
  slug: string;
}

/** Subject node in the navigation menu tree */
export interface MenuSubject {
  id: string;
  name: string;
  slug: string;
  books: MenuBook[];
}

/** Publication node in the navigation menu tree */
export interface MenuPublication {
  id: string;
  name: string;
  slug: string;
  subjects: MenuSubject[];
}

/** Category node in the navigation menu tree (recursive) */
export interface MenuCategoryNode extends Category {
  children: MenuCategoryNode[];
  publications: MenuPublication[];
}

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new category
   * Security: Admins only
   */
  async create(
    dto: CreateCategoryDto,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Category;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can create categories');
    }

    // Check if slug already exists
    const existingCategory = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existingCategory) {
      throw new ConflictException('Category with this slug already exists');
    }

    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId, deletedAt: null },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId,
        isHidden: dto.isHidden ?? false,
        displayOrder: dto.displayOrder ?? 0,
        icon: dto.icon,
        route: dto.route,
      },
    });

    return {
      message: 'Category created successfully',
      status: 'success',
      data: category,
    };
  }

  /**
   * Get all categories
   * Security: Public
   */
  async findAll(requestingUserRole?: Role): Promise<{
    message: string;
    status: string;
    data: Category[];
  }> {
    const where = requestingUserRole === Role.ADMIN ? {} : { deletedAt: null };

    const categories = await this.prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return {
      message:
        categories.length > 0
          ? 'Categories retrieved successfully'
          : 'No categories found',
      status: 'success',
      data: categories,
    };
  }

  /**
   * Get a single category by ID
   * Security: Public
   */
  async findOne(
    id: string,
    requestingUserRole?: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Category;
  }> {
    const where =
      requestingUserRole === Role.ADMIN ? { id } : { id, deletedAt: null };

    const category = await this.prisma.category.findUnique({
      where,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      message: 'Category retrieved successfully',
      status: 'success',
      data: category,
    };
  }

  /**
   * Update a category
   * Security: Admins only
   */
  async update(
    id: string,
    dto: UpdateCategoryDto,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Category;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can update categories');
    }

    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    // If slug is being changed, check if it's already taken
    if (dto.slug && dto.slug !== existingCategory.slug) {
      const slugExists = await this.prisma.category.findUnique({
        where: { slug: dto.slug },
      });

      if (slugExists) {
        throw new ConflictException('Slug already in use');
      }
    }

    // If parentId is being changed, check if it exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId, deletedAt: null },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId,
        isHidden: dto.isHidden,
        displayOrder: dto.displayOrder,
        icon: dto.icon,
        route: dto.route,
      },
    });

    return {
      message: 'Category updated successfully',
      status: 'success',
      data: category,
    };
  }

  /**
   * Get the navigation menu for the customer navbar
   * Security: Public (non-hidden categories) / Admin (all categories)
   */
  async findMenu(requestingUserRole?: Role): Promise<{
    message: string;
    status: string;
    data: Category[];
  }> {
    const where =
      requestingUserRole === Role.ADMIN
        ? { deletedAt: null }
        : { deletedAt: null, isHidden: false };

    const categories = await this.prisma.category.findMany({
      where,
      include: {
        children: {
          where: {
            deletedAt: null,
            ...(requestingUserRole !== Role.ADMIN ? { isHidden: false } : {}),
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return {
      message: 'Menu retrieved successfully',
      status: 'success',
      data: categories,
    };
  }

  /**
   * Get the full navigation menu tree for the customer navbar:
   * Category -> Publication -> Subject -> Book
   *
   * Security: Public (non-hidden categories, active publications/subjects,
   * published books only) / Admin (sees everything, including hidden
   * categories, inactive publications/subjects and draft books)
   *
   * Categories with no books are still returned with an empty `publications`
   * array so the navbar can link to the category page itself — visibility is
   * controlled by the admin via `isHidden`.
   */
  async findMenuTree(requestingUserRole?: Role): Promise<{
    message: string;
    status: string;
    data: MenuCategoryNode[];
  }> {
    const isAdmin = requestingUserRole === Role.ADMIN;

    // 1. Load every category the requester is allowed to see. The tree
    //    (roots + nested children) is assembled in memory below.
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        ...(isAdmin ? {} : { isHidden: false }),
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    // 2. Load the books the requester is allowed to see, with their category
    //    assignments, publication and subject. Grouping in memory avoids
    //    nested per-category queries.
    const books = await this.prisma.book.findMany({
      where: {
        deletedAt: null,
        ...(isAdmin ? {} : { status: BookStatus.PUBLISHED }),
      },
      include: {
        categories: true,
        publication: true,
        subject: true,
      },
      orderBy: { title: 'asc' },
    });

    // 3. Group books: categoryId -> publicationId -> subjectId -> books
    const publicationLookup = new Map<
      string,
      { id: string; name: string; slug: string }
    >();
    const subjectLookup = new Map<
      string,
      { id: string; name: string; slug: string }
    >();
    const grouped = new Map<string, Map<string, Map<string, MenuBook[]>>>();

    for (const book of books) {
      const { publication, subject } = book;
      if (!publication || !subject) continue;
      // Public users only see active publications/subjects
      if (!isAdmin && (!publication.isActive || !subject.isActive)) continue;

      publicationLookup.set(publication.id, {
        id: publication.id,
        name: publication.name,
        slug: publication.slug,
      });
      subjectLookup.set(subject.id, {
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
      });

      const bookEntry: MenuBook = {
        id: book.id,
        title: book.title,
        slug: book.slug,
      };

      // A book can belong to multiple categories, so it is nested under
      // every category it is assigned to.
      for (const assignment of book.categories) {
        let pubMap = grouped.get(assignment.categoryId);
        if (!pubMap) {
          pubMap = new Map();
          grouped.set(assignment.categoryId, pubMap);
        }

        let subjectMap = pubMap.get(publication.id);
        if (!subjectMap) {
          subjectMap = new Map();
          pubMap.set(publication.id, subjectMap);
        }

        const subjectBooks = subjectMap.get(subject.id) ?? [];
        subjectBooks.push(bookEntry);
        subjectMap.set(subject.id, subjectBooks);
      }
    }

    // 4. Serialize the grouped books into the nested menu structure.
    const buildNode = (category: Category): MenuCategoryNode => {
      const pubMap = grouped.get(category.id);

      const publications: MenuPublication[] = pubMap
        ? Array.from(pubMap.entries())
            .map(([publicationId, subjectMap]) => {
              const publication = publicationLookup.get(publicationId);
              const subjects: MenuSubject[] = Array.from(subjectMap.entries())
                .map(([subjectId, subjectBooks]) => {
                  const subject = subjectLookup.get(subjectId);
                  return {
                    id: subject?.id ?? subjectId,
                    name: subject?.name ?? '',
                    slug: subject?.slug ?? '',
                    books: subjectBooks,
                  };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

              return {
                id: publication?.id ?? publicationId,
                name: publication?.name ?? '',
                slug: publication?.slug ?? '',
                subjects,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];

      const children = categories
        .filter((child) => child.parentId === category.id)
        .map(buildNode);

      return { ...category, children, publications };
    };

    // `categories` is already sorted by displayOrder then name, so filtering
    // preserves the menu order.
    const data = categories
      .filter((category) => category.parentId === null)
      .map(buildNode);

    return {
      message: 'Menu tree retrieved successfully',
      status: 'success',
      data,
    };
  }

  /**
   * Delete a category (soft delete)
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
      throw new ForbiddenException('Only administrators can delete categories');
    }

    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Soft delete
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return {
      message: 'Category deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
