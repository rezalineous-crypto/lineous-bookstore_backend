/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/auth/optional-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';

/**
 * Request interface with user from JWT
 */
interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * Create a new category
   * Access: Admins only
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCategoryDto, @Request() req: RequestWithUser) {
    return this.categoryService.create(dto, req.user.role);
  }

  /**
   * Get all categories
   * Access: Public
   */
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.categoryService.findAll(req?.user?.role);
  }

  /**
   * Get the navigation menu for the customer navbar
   * Access: Public (non-hidden categories) / Admin (all categories)
   *
   * NOTE: This MUST be declared before @Get(':id'). NestJS matches routes in
   * declaration order, so a static segment declared after a parametrized one
   * would be shadowed (GET /categories/menu would hit findOne with id="menu").
   */
  @Get('menu')
  @UseGuards(OptionalJwtAuthGuard)
  findMenu(@Request() req: RequestWithUser) {
    return this.categoryService.findMenu(req?.user?.role);
  }

  /**
   * Get the full navigation menu tree: Category -> Publication -> Subject -> Book
   * Access: Public (non-hidden categories) / Admin (all categories)
   *
   * NOTE: This MUST be declared before @Get(':id'). NestJS matches routes in
   * declaration order, so a static segment declared after a parametrized one
   * would be shadowed (GET /categories/menu/tree would hit findOne with
   * id="menu").
   */
  @Get('menu/tree')
  @UseGuards(OptionalJwtAuthGuard)
  findMenuTree(@Request() req: RequestWithUser) {
    return this.categoryService.findMenuTree(req?.user?.role);
  }

  /**
   * Get a single category by ID
   * Access: Public
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.categoryService.findOne(id, req?.user?.role);
  }

  /**
   * Update a category
   * Access: Admins only
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.categoryService.update(id, dto, req.user.role);
  }

  /**
   * Delete a category
   * Access: Admins only
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.categoryService.remove(id, req.user.role);
  }
}
