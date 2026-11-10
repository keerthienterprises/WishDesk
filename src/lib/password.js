// Password rule for every account: at least 8 characters with a letter and a number.
// The manage-users edge function enforces the same rule on the server.
export const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.'

/** Returns what's wrong with a password, or null if it's fine. */
export function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
  return null
}
