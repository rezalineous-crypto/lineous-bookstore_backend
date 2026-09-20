/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  //   ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookPartDto } from './dto/create-book-part.dto';
import { UpdateBookPartDto } from './dto/update-book-part.dto';
import { BookPaper, Role, BookStatus } from '@prisma/client';

@Injectable()
export class BookPartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new book part
   * Security: Admins only
   */
  async create(
    dto: CreateBookPartDto,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: BookPaper;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can create book parts');
    }

    // Check if book exists
    const book = await this.prisma.book.findUnique({
      where: { id: dto.bookId, deletedAt: null },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const bookPart = await this.prisma.bookPaper.create({
      data: {
        bookId: dto.bookId,
        name: dto.title,
        sortOrder: dto.partNumber,
        price: dto.price || 0,
      },
    });

    return {
      message: 'Book part created successfully',
      status: 'success',
      data: bookPart,
    };
  }

  /**
   * Get all book parts for a book
   * Security: Public
   */
  async findAll(
    bookId: string,
    requestingUserRole?: Role,
  ): Promise<{
    message: string;
    status: string;
    data: BookPaper[];
  }> {
    const where =
      requestingUserRole === Role.ADMIN
        ? { bookId }
        : { bookId, book: { deletedAt: null, status: BookStatus.PUBLISHED } };

    const bookParts = await this.prisma.bookPaper.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return {
      message:
        bookParts.length > 0
          ? 'Book parts retrieved successfully'
          : 'No book parts found',
      status: 'success',
      data: bookParts,
    };
  }

  /**
   * Get a single book part by ID
   * Security: Public
   */
  async findOne(
    id: string,
    requestingUserRole?: Role,
  ): Promise<{
    message: string;
    status: string;
    data: BookPaper;
  }> {
    const bookPart =
      requestingUserRole === Role.ADMIN
        ? await this.prisma.bookPaper.findUnique({ where: { id } })
        : await this.prisma.bookPaper.findFirst({
            where: {
              id,
              book: { deletedAt: null, status: BookStatus.PUBLISHED },
            },
          });

    if (!bookPart) {
      throw new NotFoundException('Book part not found');
    }

    return {
      message: 'Book part retrieved successfully',
      status: 'success',
      data: bookPart,
    };
  }

  /**
   * Update a book part
   * Security: Admins only
   */
  async update(
    id: string,
    dto: UpdateBookPartDto,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: BookPaper;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can update book parts');
    }

    const existingBookPart = await this.prisma.bookPaper.findUnique({
      where: { id },
    });

    if (!existingBookPart) {
      throw new NotFoundException('Book part not found');
    }

    const bookPart = await this.prisma.bookPaper.update({
      where: { id },
      data: {
        name: dto.title,
        sortOrder: dto.partNumber,
        price: dto.price,
      },
    });

    return {
      message: 'Book part updated successfully',
      status: 'success',
      data: bookPart,
    };
  }

  /**
   * Delete a book part (soft delete)
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
      throw new ForbiddenException('Only administrators can delete book parts');
    }

    const bookPart = await this.prisma.bookPaper.findUnique({
      where: { id, book: { deletedAt: null } },
    });

    if (!bookPart) {
      throw new NotFoundException('Book part not found');
    }

    // Soft delete
    await this.prisma.bookPaper.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return {
      message: 'Book part deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
