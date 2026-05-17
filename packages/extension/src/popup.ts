const patInput = document.getElementById('pat') as HTMLInputElement;
const repoInput = document.getElementById('repo') as HTMLInputElement;
const branchInput = document.getElementById('branch') as HTMLInputElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const testBtn = document.getElementById('test') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

// Load saved values
chrome.storage.sync.get(['pat', 'mainRepo', 'mainBranch'], (result) => {
  if (result.pat) patInput.value = result.pat;
  if (result.mainRepo) repoInput.value = result.mainRepo;
  if (result.mainBranch) branchInput.value = result.mainBranch;
});

saveBtn.addEventListener('click', () => {
  chrome.storage.sync.set({
    pat: patInput.value.trim(),
    mainRepo: repoInput.value.trim(),
    mainBranch: branchInput.value.trim() || 'main',
  }, () => {
    statusEl.textContent = 'Saved';
    statusEl.className = 'ok';
  });
});

testBtn.addEventListener('click', async () => {
  const pat = patInput.value.trim();
  if (!pat) {
    statusEl.textContent = 'No PAT entered';
    statusEl.className = 'err';
    return;
  }
  statusEl.textContent = 'Testing...';
  statusEl.className = '';
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      statusEl.textContent = `OK: ${data.login}`;
      statusEl.className = 'ok';
    } else {
      statusEl.textContent = `Failed: ${resp.status}`;
      statusEl.className = 'err';
    }
  } catch (e: any) {
    statusEl.textContent = `Error: ${e.message}`;
    statusEl.className = 'err';
  }
});
