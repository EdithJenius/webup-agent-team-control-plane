import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { listFiles, readJson } from "./files.mjs";

export async function loadSchemaRegistry(rootDir) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const file of await listFiles(path.join(rootDir, "schemas"), ".json")) {
    ajv.addSchema(await readJson(file));
  }
  return ajv;
}

export function validateAgainst(ajv, schemaId, value, location) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) return [{ code: "SCHEMA_NOT_FOUND", location, message: schemaId }];
  if (validate(value)) return [];
  return validate.errors.map((error) => ({
    code: "SCHEMA_VALIDATION",
    location: `${location}${error.instancePath}`,
    message: `${error.message}${error.params?.missingProperty ? `: ${error.params.missingProperty}` : ""}`,
  }));
}
