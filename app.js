const fileInput = document.querySelector('#fileInput');
const uploadZone = document.querySelector('#uploadZone');
const sourcePreview = document.querySelector('#sourcePreview');
const uploadTitle = document.querySelector('#uploadTitle');
const uploadHint = document.querySelector('#uploadHint');
const generateBtn = document.querySelector('#generateBtn');
const emptyState = document.querySelector('#emptyState');
const loadingState = document.querySelector('#loadingState');
const loadingText = document.querySelector('#loadingText');
const resultImage = document.querySelector('#resultImage');
const downloadBtn = document.querySelector('#downloadBtn');
const toast = document.querySelector('#toast');
let selectedFile = null;
let generatedDataUrl = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
}

function acceptFile(file) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return showToast('请选择 JPG、PNG 或 WEBP 图片。');
  if (file.size > 12 * 1024 * 1024) return showToast('图片不能超过 12 MB。');
  selectedFile = file;
  const previewUrl = URL.createObjectURL(file);
  sourcePreview.src = previewUrl;
  sourcePreview.hidden = false;
  uploadTitle.textContent = file.name;
  uploadHint.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · 已准备好`;
  uploadZone.classList.add('has-image');
  showToast('照片已添加，可以开始生成了。');
}

uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', event => acceptFile(event.target.files?.[0]));
for (const eventName of ['dragenter', 'dragover']) {
  uploadZone.addEventListener(eventName, event => { event.preventDefault(); uploadZone.classList.add('dragover'); });
}
for (const eventName of ['dragleave', 'drop']) {
  uploadZone.addEventListener(eventName, event => { event.preventDefault(); uploadZone.classList.remove('dragover'); });
}
uploadZone.addEventListener('drop', event => acceptFile(event.dataTransfer?.files?.[0]));

document.querySelectorAll('.scene-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.scene-card').forEach(item => item.classList.remove('selected'));
    card.classList.add('selected');
  });
});

function setBusy(busy) {
  generateBtn.disabled = busy;
  generateBtn.innerHTML = busy ? '<span>✦</span> AI 正在创作… <b>•••</b>' : '<span>✦</span> 生成我的大象合影 <b>→</b>';
  loadingState.hidden = !busy;
  if (busy) {
    emptyState.hidden = true;
    resultImage.hidden = true;
  }
}

generateBtn.addEventListener('click', async () => {
  if (!selectedFile) return showToast('请先上传一张照片。');
  const scene = document.querySelector('.scene-card.selected')?.dataset.scene || 'forest';
  const formData = new FormData();
  formData.append('photo', selectedFile);
  formData.append('scene', scene);
  formData.append('extra', document.querySelector('#extraPrompt').value);
  setBusy(true);
  loadingText.textContent = '正在安全上传照片并准备 AI 编辑…';
  const phases = [
    'AI 正在理解你的照片与场景…',
    '正在安排自然的光线与构图…',
    '正在创造你和大象的合影…',
    '正在完成最后的画面细节…'
  ];
  let phase = 0;
  const phaseTimer = setInterval(() => { phase = (phase + 1) % phases.length; loadingText.textContent = phases[phase]; }, 7000);
  try {
    const response = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '生成失败，请稍后重试。');
    if (!data.image?.startsWith('data:image/png;base64,')) throw new Error('服务器返回的图片格式不正确。');
    generatedDataUrl = data.image;
    resultImage.src = generatedDataUrl;
    resultImage.hidden = false;
    emptyState.hidden = true;
    document.querySelector('#resultTitle').textContent = '你的专属大象合影已完成';
    document.querySelector('#resultMeta').textContent = 'AI GENERATED · PNG';
    downloadBtn.disabled = false;
    showToast('合影生成成功！可以保存图片了。');
  } catch (error) {
    emptyState.hidden = false;
    showToast(error.message || '网络连接失败，请检查服务器。');
  } finally {
    clearInterval(phaseTimer);
    setBusy(false);
  }
});

downloadBtn.addEventListener('click', () => {
  if (!generatedDataUrl) return;
  const link = document.createElement('a');
  link.href = generatedDataUrl;
  link.download = `elephant-dream-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});
