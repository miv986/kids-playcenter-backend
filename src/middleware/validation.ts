// src/middleware/validate.dto.ts
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Request, Response, NextFunction } from "express";

export const validateDTO = (DTOClass: any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const dtoObject = plainToInstance(DTOClass, req.body);
    const errors = await validate(dtoObject);
    

    if (errors.length > 0) {
      const messages = errors.map(err => Object.values(err.constraints || {})).flat();
      return res.status(400).json({ errors: messages });
    }

    req.body = dtoObject; // opcional: transforma el body a la clase
    next();
  };
};
