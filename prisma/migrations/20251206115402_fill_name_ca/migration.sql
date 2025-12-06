-- This is an empty migration.
UPDATE "BirthdayPackage"
SET 
  "nameCa" = COALESCE("nameCa", 'Pendiente'),
  "nameEs" = COALESCE("nameEs", 'Pendiente');
