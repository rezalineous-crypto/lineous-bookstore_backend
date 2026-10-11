import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';

export class AddToCartDto {
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @IsOptional()
  @IsString()
  paperId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}
