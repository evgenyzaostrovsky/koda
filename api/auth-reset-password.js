const { getSupabaseAdmin } = require('./_supabaseAdmin');

function cleanLogin(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const username = cleanLogin(req.body?.username);
  const password = String(req.body?.password || '').trim();

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    res.status(400).json({ error: 'Логин: 3-24 символа, латиница, цифры или _.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Пароль минимум 6 символов.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.id) {
      res.status(404).json({ error: 'Пользователь не найден.' });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(profile.id, { password });

    if (error) {
      throw error;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error?.message || 'Не удалось сменить пароль.';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Bearer token')) {
      res.status(500).json({ error: 'На Vercel не добавлен SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    res.status(500).json({ error: message });
  }
};
