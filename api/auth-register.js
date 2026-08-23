const { getSupabaseAdmin } = require('./_supabaseAdmin');

function cleanLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function loginEmail(username) {
  return `${username}@koda-life.vercel.app`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const username = cleanLogin(req.body?.username);
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    res.status(400).json({ error: 'Логин: 3-24 символа, латиница, цифры или _.' });
    return;
  }

  if (!name || password.length < 6) {
    res.status(400).json({ error: 'Заполни имя и пароль минимум 6 символов.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const email = loginEmail(username);
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (existingProfile?.id) {
      res.status(409).json({ error: 'Такой логин уже занят.' });
      return;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { name, username },
    });

    if (error) {
      throw error;
    }

    if (data.user?.id) {
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, email, name, username }, { onConflict: 'id' });
    }

    res.status(200).json({ email });
  } catch (error) {
    const message = error?.message || 'Не удалось создать аккаунт.';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Bearer token')) {
      res.status(500).json({ error: 'На Vercel не добавлен SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    res.status(500).json({ error: message });
  }
};
