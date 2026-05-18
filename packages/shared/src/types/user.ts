/**
 * Public user representation returned by the API.
 * Persons are modelled by Entra oid + email — never free text.
 */
export type UserDTO = {
  id: string;
  entraOid: string;
  email: string;
  displayName: string;
};

/**
 * Subset of Entra ID JWT claims the backend relies on.
 */
export type EntraClaims = {
  oid: string;
  email?: string;
  preferred_username?: string;
  name?: string;
};
