export const ROLES = {
  admin: { label: 'Admin', description: 'Full access, including users, roles and organisation settings' },
  team_lead: { label: 'Team Lead', description: 'Creates campaigns, manages contacts & templates, sees reports' },
  member: { label: 'Member', description: 'Sends messages to the clients assigned to them' },
}

export const roleLabel = (role) => ROLES[role]?.label ?? role
