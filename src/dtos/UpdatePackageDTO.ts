import { IsString, IsBoolean, IsArray, IsInt, IsOptional, Min } from "class-validator";

export class UpdatePackageDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceValue?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

