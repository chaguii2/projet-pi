// Enum des rôles utilisateurs
// - SUPER_ADMIN : administrateur global
// - COMPANY : compte entreprise
// - CLIENT : client/utilisateur final
// - EMPLOYEE : employé lié à une entreprise (ajouté par la company)
const UserRoles = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  COMPANY: 'company',
  EMPLOYEE: 'employee',
  CLIENT: 'client'
});

module.exports = UserRoles;
