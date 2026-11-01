// Password changes must go through Supabase Auth with the user's session.
// This legacy endpoint accepted a username without proof of identity.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.status(410).json({ error: 'Обновите приложение и смените пароль в профиле.' });
};
