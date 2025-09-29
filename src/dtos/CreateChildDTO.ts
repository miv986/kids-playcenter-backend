// src/dtos/CreateChildDTO.ts
import { Transform } from "class-transformer";
import { IsString, IsNotEmpty, IsOptional, IsDateString, Matches, IsISO8601 } from "class-validator";

export class CreateChildDTO {
    @IsString({ message: "name debe ser un string" })
    @IsNotEmpty({ message: "name es obligatorio" })
    name!: string;

    @IsString({ message: "surname debe ser un string" })
    @IsNotEmpty({ message: "surname es obligatorio" })
    surname!: string;

    @IsOptional()
    @IsISO8601({ strict: true }, { message: "dateOfBirth debe ser una fecha válida (YYYY-MM-DD)" })
    @Transform(({ value }) => {
      if (!value) return undefined;
      if (typeof value === "string") return new Date(`${value}T00:00:00.000Z`);
      return value; // si ya es Date, lo deja pasar
    })
    dateOfBirth?: Date;
    

    @IsNotEmpty()
    @IsString({ message: "notes debe ser un string" })
    notes!: string;

    @IsNotEmpty()
    @IsString({ message: "medicalNotes debe ser un string" })
    medicalNotes?: string;

    @IsOptional()
    @IsString({ message: "allergies debe ser un string" })
    allergies?: string;

    @IsOptional()
    @IsString({ message: "emergency_contact_name_1 debe ser un string" })
    emergency_contact_name_1?: string;

    @IsOptional()
    @IsString({ message: "emergency_contact_name_2 debe ser un string" })
    emergency_contact_name_2?: string;

    @IsOptional()
    @IsString({ message: "emergency_phone_1 debe ser un string" })
    emergency_phone_1?: string;

    @IsOptional()
    @IsString({ message: "emergency_phone_2 debe ser un string" })
    emergency_phone_2?: string;
}
