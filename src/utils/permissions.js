export const permissions = {
  admin: ["dashboard","transactions","accounts","expenses","services","inventory","customers","staff","cash","money","reports","audit","settings"],
  attendant: ["dashboard","transactions","cash","money","customers"]
};
export function can(role, permission) {
  return permissions[role]?.includes(permission) ?? false;
}
