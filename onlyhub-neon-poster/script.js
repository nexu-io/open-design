const fill = document.querySelector('.loader-fill');
const percent = document.querySelector('#percent');
const glow = document.querySelector('.loader-glow');

let value = 81;
setInterval(() => {
  value = value >= 99 ? 81 : value + 1;
  fill.style.width = `${value}%`;
  glow.style.left = `${value - 1}%`;
  percent.textContent = `${value}%`;
}, 1800);
