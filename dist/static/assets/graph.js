
// 参照関係グラフの簡易可視化
(function() {
  const canvas = document.getElementById('reference-graph');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  canvas.width = width;
  canvas.height = height;
  
  // 背景
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, width, height);
  
  // 簡易的なグラフ描画
  const centerX = width / 2;
  const centerY = height / 2;
  
  // 法令ノード
  const laws = [
    { name: '民法', x: centerX - 150, y: centerY - 100, id: '129AC0000000089' },
    { name: '民事訴訟法', x: centerX + 150, y: centerY - 100, id: '155AC0000000048' },
    { name: '消費税法', x: centerX - 150, y: centerY + 100, id: '323AC0000000131' },
    { name: '独占禁止法', x: centerX + 150, y: centerY + 100, id: '222AC0000000067' }
  ];
  
  // ノードを描画
  laws.forEach(law => {
    // ノード
    ctx.beginPath();
    ctx.arc(law.x, law.y, 40, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#1a5490';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // ラベル
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(law.name, law.x, law.y);
  });
  
  // 参照関係を描画（例）
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  // 民事訴訟法→民法
  ctx.beginPath();
  ctx.moveTo(laws[1].x - 40, laws[1].y);
  ctx.lineTo(laws[0].x + 40, laws[0].y);
  ctx.stroke();
  
  // 独占禁止法→民法
  ctx.beginPath();
  ctx.moveTo(laws[3].x - 40, laws[3].y - 20);
  ctx.lineTo(laws[0].x + 20, laws[0].y + 40);
  ctx.stroke();
  
  // 凡例
  ctx.setLineDash([]);
  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('● 法令', 20, height - 40);
  ctx.fillText('--- 参照関係', 20, height - 20);
})();