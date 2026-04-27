import jwt from 'jsonwebtoken';

const JWT_SECRET = 'dev-secret-change-in-prod';

/**
 * Inject admin authentication into localStorage
 * @param {Page} page - Playwright page object
 * @param {string} role - User role (owner, head_waiter, waiter)
 */
export async function setAdminAuth(page, role = 'owner') {
  const token = jwt.sign(
    { id: 'test-admin-uuid', name: 'Test Admin', role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const user = JSON.stringify({
    id: 'test-admin-uuid',
    name: 'Test Admin',
    role
  });

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', user);
  }, { token, user });
}
