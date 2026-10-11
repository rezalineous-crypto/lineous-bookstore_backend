import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsBoolean()
  @IsOptional()
  isHidden?: boolean;

  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  route?: string;
}
