import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

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
