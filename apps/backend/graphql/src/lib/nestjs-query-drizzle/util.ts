/**
 * Derive the GraphQL entity name from a DTO class.
 *
 * Convention: drop a trailing "Dto" / "DTO" suffix so `class UserDto` becomes
 * "User", matching the @ObjectType('User') override on the DTO and the
 * `<entity>` / `<entityPlural>` naming refine's nestjs-query data provider
 * expects (`UserFilter`, `UserSort`, `UserConnection`, `UserDeleteResponse`,
 * not `UserDtoFilter` etc.).
 */
export function deriveEntityName(klass: { name: string }): string {
  return klass.name.replace(/(Dto|DTO)$/, '');
}
