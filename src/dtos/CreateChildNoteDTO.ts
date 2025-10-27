import { IsInt, IsString, IsArray, IsOptional, ArrayMinSize } from "class-validator";

export class CreateChildNoteDTO {
  @IsInt()
  childId!: number;

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}


