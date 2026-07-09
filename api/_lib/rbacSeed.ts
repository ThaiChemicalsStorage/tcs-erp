import { defaultRoles } from "../../src/lib/roles.js";
import { rolesCollection } from "./collections.js";

/** Idempotent: only seeds when the roles collection is empty (fresh DB or first-run setup). */
export async function seedDefaultRolesIfEmpty(): Promise<void> {
  const roles = await rolesCollection();
  const count = await roles.estimatedDocumentCount();
  if (count === 0) {
    await roles.insertMany(defaultRoles);
  }
}
