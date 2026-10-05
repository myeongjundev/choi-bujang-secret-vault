import { createClient } from '@supabase/supabase-js';
const $ = id => document.getElementById(id);
let auth, session, editing = null;
const message = text => { $('status').textContent = text; };
function clearEditor() {
  editing = null; $('editor').reset(); $('save').textContent = '메모 추가'; $('cancel').hidden = true;
}
async function api(path = '', method = 'GET', body) {
  const { data } = await auth.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');
  const response = await fetch(`/api/notes${path}`, {
    method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? '로그인이 만료됐습니다. 다시 로그인하세요.' : `요청에 실패했습니다 (${response.status}).`);
  return result;
}
async function listNotes() {
  try {
    const notes = await api();
    $('notes').replaceChildren(...notes.map(note => {
      const item = document.createElement('li');
      const title = document.createElement('strong'); title.textContent = note.title;
      const content = document.createElement('span'); content.textContent = note.body;
      const edit = document.createElement('button'); edit.textContent = '수정';
      edit.onclick = () => { editing = note.id; $('title').value = note.title; $('body').value = note.body; $('save').textContent = '수정 저장'; $('cancel').hidden = false; };
      const remove = document.createElement('button'); remove.textContent = '삭제';
      remove.onclick = async () => { try { await api(`/${note.id}`, 'DELETE'); clearEditor(); await listNotes(); message('메모를 삭제했습니다.'); } catch (error) { message(error.message); } };
      item.append(title, content, edit, remove); return item;
    }));
    if (!notes.length) { const item = document.createElement('li'); item.textContent = '가상 메모를 추가해 보세요.'; $('notes').append(item); }
  } catch (error) { message(error.message); }
}
function showSession(next) {
  session = next;
  $('login').hidden = !!session; $('logout').hidden = !session; $('workspace').hidden = !session;
  $('notes').replaceChildren(); clearEditor();
  message(session ? '로그인했습니다.' : '로그인하지 않은 상태입니다.');
  if (session) listNotes();
}
try {
  const response = await fetch('/api/auth-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('공개 로그인 키 설정이 필요합니다.');
  const config = await response.json();
  auth = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
  auth.auth.onAuthStateChange((_event, next) => { queueMicrotask(() => showSession(next)); });
  showSession((await auth.auth.getSession()).data.session);
  $('login').onsubmit = async event => {
    event.preventDefault();
    const password = $('password').value; $('password').value = '';
    const { error } = await auth.auth.signInWithPassword({ email: $('email').value, password });
    if (error) message(`로그인에 실패했습니다: ${error.message}`);
  };
  $('logout').onclick = async () => {
    const { error } = await auth.auth.signOut({ scope: 'local' });
    if (error) message('로그아웃에 실패했습니다.'); else showSession(null);
  };
  $('cancel').onclick = clearEditor;
  $('editor').onsubmit = async event => {
    event.preventDefault();
    try {
      await api(editing ? `/${editing}` : '', editing ? 'PUT' : 'POST', { title: $('title').value, body: $('body').value });
      clearEditor(); await listNotes(); message('메모를 저장했습니다.');
    } catch (error) { message(error.message); }
  };
} catch (error) { message(error.message); $('login').querySelector('button').disabled = true; }
