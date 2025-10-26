import {
    IsInt,
    IsOptional,
    IsString,
    IsDateString,
    MaxLength,
    IsArray,
    ArrayMinSize,
} from "class-validator";

export class UpdateDaycareBookingDTO {
    @IsOptional()
    @IsDateString({}, { message: "La fecha/hora de inicio no es válida." })
    startTime?: string;

    @IsOptional()
    @IsDateString({}, { message: "La fecha/hora de fin no es válida." })
    endTime?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: "Debe haber al menos un hijo." })
    @IsInt({ each: true })
    childrenIds?: number[];

    @IsOptional()
    @IsString()
    @MaxLength(500, { message: "El comentario no puede exceder los 500 caracteres." })
    comments?: string;
}

