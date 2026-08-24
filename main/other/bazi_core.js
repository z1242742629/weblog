// ===== 八字核心算法（可在浏览器与 Node 中复用）=====
// 说明：本算法基于天文公式（Meeus 低精度太阳黄经）计算节气，
// 以节气定月柱、立春定年柱、子时换日定日柱，结果接近专业排盘。
// 仅供传统文化研究/娱乐参考，非科学论断。

const GAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
// 五行索引：0木 1火 2土 3金 4水
const GAN_ELEMENT = [0,0,1,1,2,2,3,3,4,4];
const ELEM_NAME = ["木","火","土","金","水"];
const ELEM_COLOR = ["#2e8b57","#e0533d","#c9a227","#8a8d93","#2f6fb0"];

// 地支藏干：[天干索引, 权重(本气1.0/中气0.5/余气0.25)]
const ZHI_HIDDEN = {
  0:[[9,1.0]],
  1:[[5,1.0],[9,0.5],[6,0.25]],
  2:[[0,1.0],[2,0.5],[4,0.25]],
  3:[[1,1.0]],
  4:[[4,1.0],[1,0.5],[9,0.25]],
  5:[[2,1.0],[6,0.5],[4,0.25]],
  6:[[3,1.0],[5,0.5]],
  7:[[5,1.0],[3,0.5],[1,0.25]],
  8:[[6,1.0],[8,0.5],[4,0.25]],
  9:[[7,1.0]],
  10:[[4,1.0],[7,0.5],[3,0.25]],
  11:[[8,1.0],[0,0.5]]
};

// ===== 历法/天文基础 =====
function gregorianToJDN(y, m, d, hh, mm) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  jd += (hh - 12) / 24 + mm / 1440;
  return jd;
}
function jdToGregorian(jd) {
  const Z = Math.floor(jd + 0.5);
  const F = (jd + 0.5) - Z; // 当日小数部分（自午夜起）
  const a = Z + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const mm = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * mm + 2) / 5) + 1;
  const month = mm + 3 - 12 * Math.floor(mm / 10);
  const year = 100 * b + d - 4800 + Math.floor(mm / 10);
  const hour = F * 24;
  const h = Math.floor(hour);
  const min = Math.floor((hour - h) * 60 + 0.5);
  return { y: year, m: month, d: day, hour: h, minute: min };
}
// 太阳视黄经（Meeus 低精度），返回 0-360 度
function sunApparentLongitude(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = M * Math.PI / 180;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
          + 0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  const Omega = 125.04 - 1934.136 * T;
  let app = trueLong - 0.00569 - 0.00478 * Math.sin(Omega * Math.PI / 180);
  app = ((app % 360) + 360) % 360;
  return app;
}
// 二分查找某年特定黄经（节气）对应的 UTC 儒略日
const TERM_APPROX = {
  315:[2,4],330:[2,19],345:[3,6],0:[3,21],15:[4,5],30:[4,20],
  45:[5,6],60:[5,21],75:[6,6],90:[6,21],105:[7,7],120:[7,23],
  135:[8,8],150:[8,23],165:[9,8],180:[9,23],195:[10,8],210:[10,24],
  225:[11,8],240:[11,22],255:[12,7],270:[12,22],285:[1,6],300:[1,20]
};
function findSolarTermJD(year, lambda) {
  const ap = TERM_APPROX[lambda];
  const startJD = gregorianToJDN(year, ap[0], ap[1], 0, 0);
  let lo = startJD - 20, hi = startJD + 20;
  const g = (jd) => Math.sin((sunApparentLongitude(jd) - lambda) * Math.PI / 180);
  let glo = g(lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (glo * g(mid) <= 0) { hi = mid; }
    else { lo = mid; glo = g(mid); }
  }
  return (lo + hi) / 2;
}
// 返回北京时间(UTC+8)的节气日期
function getJieqiDateBeijing(year, lambda) {
  const jdUTC = findSolarTermJD(year, lambda);
  const jdBJ = jdUTC + 8 / 24;
  return jdToGregorian(jdBJ);
}

// ===== 干支计算 =====
function dayGZIndex(y, m, d) {
  // 以北京时间中午为基准，得到该农历日的干支序号(0=甲子)
  const jd = gregorianToJDN(y, m, d, 12, 0) - 8 / 24;
  // 以 2024-02-10（甲辰日，序号40）校准六十甲子日序
  return ((Math.floor(jd + 0.5) + 50) % 60 + 60) % 60;
}
function yearGZIndex(y) {
  return ((y - 4) % 60 + 60) % 60;
}
// 五虎遁：返回某年 寅月 的天干序号
function yinMonthStem(yearGanIdx) {
  switch (yearGanIdx % 10) {
    case 0: case 5: return 2; // 甲己 -> 丙
    case 1: case 6: return 4; // 乙庚 -> 戊
    case 2: case 7: return 6; // 丙辛 -> 庚
    case 3: case 8: return 8; // 丁壬 -> 壬
    case 4: case 9: return 0; // 戊癸 -> 甲
  }
  return 0;
}
// 根据出生日期(北京时间)求月柱 {ganIdx, zhiIdx, yearForStem}
function monthPillar(y, m, d, hour) {
  const ym1 = y - 1;
  const terms = [
    {lam:255, zhi:0, y:ym1},  // 大雪 -> 子月（前一年）
    {lam:285, zhi:1, y:y},    // 小寒 -> 丑月
    {lam:315, zhi:2, y:y},    // 立春 -> 寅月
    {lam:345, zhi:3, y:y},    // 惊蛰 -> 卯月
    {lam:15,  zhi:4, y:y},    // 清明 -> 辰月
    {lam:45,  zhi:5, y:y},    // 立夏 -> 巳月
    {lam:75,  zhi:6, y:y},    // 芒种 -> 午月
    {lam:105, zhi:7, y:y},    // 小暑 -> 未月
    {lam:135, zhi:8, y:y},    // 立秋 -> 申月
    {lam:165, zhi:9, y:y},    // 白露 -> 酉月
    {lam:195, zhi:10,y:y},    // 寒露 -> 戌月
    {lam:225, zhi:11,y:y},    // 立冬 -> 亥月
    {lam:255, zhi:0, y:y},    // 大雪 -> 子月（本年）
    {lam:285, zhi:1, y:y+1}   // 小寒 -> 丑月（下一年）
  ];
  const birthJD = gregorianToJDN(y, m, d, hour, 0) - 8 / 24;
  let chosen = null;
  for (const t of terms) {
    const jd = findSolarTermJD(t.y, t.lam);
    if (jd <= birthJD) chosen = t;
  }
  if (!chosen) chosen = terms[0];
  const yStem = yearGZIndex(chosen.y) % 10;
  const mStem = (yinMonthStem(yStem) + (chosen.zhi - 2)) % 10;
  return { ganIdx: ((mStem % 10) + 10) % 10, zhiIdx: chosen.zhi, yearForStem: chosen.y };
}
function hourBranch(h) {
  if (h >= 23 || h < 1) return 0;
  if (h < 3) return 1;
  if (h < 5) return 2;
  if (h < 7) return 3;
  if (h < 9) return 4;
  if (h < 11) return 5;
  if (h < 13) return 6;
  if (h < 15) return 7;
  if (h < 17) return 8;
  if (h < 19) return 9;
  if (h < 21) return 10;
  return 11;
}
function ziHourStem(dayGanIdx) {
  switch (dayGanIdx % 10) {
    case 0: case 5: return 0; // 甲己 -> 甲
    case 1: case 6: return 2; // 乙庚 -> 丙
    case 2: case 7: return 4; // 丙辛 -> 戊
    case 3: case 8: return 6; // 丁壬 -> 庚
    case 4: case 9: return 8; // 戊癸 -> 壬
  }
  return 0;
}

// ===== 十神 =====
const PRODUCES = {0:1,1:2,2:3,3:4,4:0};
const CONTROLS = {0:2,2:4,4:1,1:3,3:0};
const INV_PROD = {1:0,2:1,3:2,4:3,0:4};
const INV_CTRL = {2:0,4:2,1:4,3:1,0:3};

function shiShen(dayGanIdx, otherGanIdx) {
  const de = GAN_ELEMENT[dayGanIdx];
  const dyYang = (dayGanIdx % 2 === 0);
  const se = GAN_ELEMENT[otherGanIdx];
  const syYang = (otherGanIdx % 2 === 0);
  const sameYY = (dyYang === syYang);
  if (se === de) return sameYY ? "比肩" : "劫财";
  if (PRODUCES[se] === de) return sameYY ? "偏印" : "正印";
  if (PRODUCES[de] === se) return sameYY ? "食神" : "伤官";
  if (CONTROLS[de] === se) return sameYY ? "偏财" : "正财";
  if (CONTROLS[se] === de) return sameYY ? "七杀" : "正官";
  return "未知";
}

// ===== 主计算 =====
function computeBazi({name, gender, y, m, d, hour}) {
  let dy = d, dm = m, dyy = y;
  if (hour >= 23) {
    const nd = new Date(y, m - 1, d + 1);
    dy = nd.getDate(); dm = nd.getMonth() + 1; dyy = nd.getFullYear();
  }
  const dayIdx = dayGZIndex(dyy, dm, dy);
  const dayGan = dayIdx % 10, dayZhi = dayIdx % 12;

  const lichun = getJieqiDateBeijing(y, 315);
  const birthBeforeLiChun = (m < lichun.m) || (m === lichun.m && d < lichun.d);
  const yearForPillar = birthBeforeLiChun ? y - 1 : y;
  const yearIdx = yearGZIndex(yearForPillar);
  const yearGan = yearIdx % 10, yearZhi = yearIdx % 12;

  const mp = monthPillar(y, m, d, hour);
  const monthGan = mp.ganIdx, monthZhi = mp.zhiIdx;

  const hb = hourBranch(hour);
  const hourGan = (ziHourStem(dayGan) + hb) % 10;

  const pillars = [
    {name:"年柱", gan:yearGan, zhi:yearZhi},
    {name:"月柱", gan:monthGan, zhi:monthZhi},
    {name:"日柱", gan:dayGan, zhi:dayZhi},
    {name:"时柱", gan:hourGan, zhi:hb}
  ];

  const elem = [0,0,0,0,0];
  [yearGan, monthGan, dayGan, hourGan].forEach(g => elem[GAN_ELEMENT[g]] += 1);
  [yearZhi, monthZhi, dayZhi, hb].forEach(z => {
    ZHI_HIDDEN[z].forEach(([g, w]) => { elem[GAN_ELEMENT[g]] += w; });
  });

  const de = GAN_ELEMENT[dayGan];
  let support = elem[de] + elem[INV_PROD[de]];
  let drain = elem[PRODUCES[de]] + elem[CONTROLS[de]] + elem[INV_CTRL[de]];
  const mb0 = GAN_ELEMENT[ZHI_HIDDEN[monthZhi][0][0]];
  if (mb0 === de) support += 1.5;
  if (mb0 === INV_PROD[de]) support += 1.0;
  let strength;
  if (support > drain * 1.15) strength = "身强";
  else if (drain > support * 1.15) strength = "身弱";
  else strength = "中和";

  let yong, xi;
  if (strength === "身强") {
    const cand = [INV_CTRL[de], PRODUCES[de], CONTROLS[de]];
    cand.sort((a,b) => elem[a] - elem[b]);
    yong = cand[0]; xi = cand[1];
  } else {
    const cand = [INV_PROD[de], de];
    cand.sort((a,b) => elem[a] - elem[b]);
    yong = cand[0]; xi = cand[1];
  }

  const shiShenCount = {};
  function addSS(g){ const s = shiShen(dayGan, g); shiShenCount[s] = (shiShenCount[s]||0)+1; }
  [yearGan, monthGan, hourGan].forEach(addSS);
  [yearZhi, monthZhi, dayZhi, hb].forEach(z => ZHI_HIDDEN[z].forEach(([g]) => addSS(g)));

  const birthJD = gregorianToJDN(y, m, d, hour, 0) - 8/24;
  const jieLambdas = [285,315,345,15,45,75,105,135,165,195,225,255];
  const jieList = [];
  [y-1, y, y+1].forEach(yy => jieLambdas.forEach(lam => jieList.push(findSolarTermJD(yy, lam))));
  jieList.sort((a,b)=>a-b);
  const yangYear = (yearGan % 2 === 0);
  const shun = (yangYear && gender === "男") || (!yangYear && gender === "女");
  let startDays;
  if (shun) {
    const next = jieList.find(j => j > birthJD);
    startDays = next - birthJD;
  } else {
    let prev = jieList[0];
    for (const j of jieList) { if (j < birthJD) prev = j; }
    startDays = birthJD - prev;
  }
  const startYears = startDays / 3;
  const dayun = [];
  for (let i = 0; i < 8; i++) {
    const step = shun ? i : -i;
    const g = ((monthGan + step) % 10 + 10) % 10;
    const z = ((monthZhi + step) % 12 + 12) % 12;
    dayun.push({ idx:i, gan:g, zhi:z, age: +(startYears + i*10).toFixed(1) });
  }

  const liunian = [];
  for (let yy = 2026; yy <= 2037; yy++) {
    const idx = yearGZIndex(yy);
    const g = idx % 10, z = idx % 12;
    liunian.push({ year: yy, gan:g, zhi:z, ss: shiShen(dayGan, g) });
  }

  const shenSha = computeShenSha({dayGan, yearZhi, dayZhi, monthZhi, hourZhi:hb});

  return {
    name, gender, birth:{y,m,d,hour},
    dayGan, dayZhi, dayElem:de,
    yearGan, yearZhi, monthGan, monthZhi, hourGan, hourZhi:hb,
    pillars,
    elem, strength, yong, xi, shiShenCount, dayun, liunian, shenSha,
    startYears: +startYears.toFixed(2), shun, lichun
  };
}

function computeShenSha({dayGan, yearZhi, dayZhi, monthZhi, hourZhi}) {
  const branches = [yearZhi, monthZhi, dayZhi, hourZhi];
  const res = [];
  const TIANYI = {0:[1,7],4:[1,7],6:[1,7],1:[0,8],5:[0,8],2:[11,9],3:[11,9],8:[3,5],9:[3,5],7:[6,2]};
  (TIANYI[dayGan]||[]).forEach(b => { if (branches.includes(b)) res.push({name:"天乙贵人", at:ZHI[b], desc:"主聪明、得贵人扶助"}); });
  const WENCHANG = {0:5,1:6,2:8,3:9,4:8,5:9,6:11,7:0,8:2,9:3};
  const wb = WENCHANG[dayGan];
  if (branches.includes(wb)) res.push({name:"文昌贵人", at:ZHI[wb], desc:"主聪明好学、利文途"});
  const TAOHUA = {8:[9,0,4],11:[0,3,7],2:[3,6,10],5:[6,9,1]}[yearZhi];
  if (TAOHUA && branches.includes(TAOHUA)) res.push({name:"桃花(咸池)", at:ZHI[TAOHUA], desc:"主貌美、人缘情感"});
  const YIMA = {8:2,11:5,2:8,5:11}[yearZhi];
  if (YIMA !== undefined && branches.includes(YIMA)) res.push({name:"驿马", at:ZHI[YIMA], desc:"主走动、奔波、远行"});
  const HUAGAI = {2:10,8:4,5:1,11:7}[yearZhi];
  if (HUAGAI !== undefined && branches.includes(HUAGAI)) res.push({name:"华盖", at:ZHI[HUAGAI], desc:"主聪慧、好玄学艺术"});
  const TAIJI = {0:[9,0],1:[9,0],2:[3,6],3:[3,6],4:[4,10,1,7],5:[4,10,1,7],6:[2,11],7:[2,11],8:[5,8],9:[5,8]}[dayGan];
  (TAIJI||[]).forEach(b => { if (branches.includes(b)) res.push({name:"太极贵人", at:ZHI[b], desc:"主悟性高、喜钻研"}); });
  return res;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeBazi, GAN, ZHI, ELEM_NAME, dayGZIndex, yearGZIndex, getJieqiDateBeijing };

  const t1 = computeBazi({name:"测试", gender:"男", y:2024, m:2, d:10, hour:12});
  console.log("测试1 2024-02-10 12:00 男");
  console.log("  年柱:", GAN[t1.yearGan]+ZHI[t1.yearZhi], "(应=甲辰)");
  console.log("  日柱:", GAN[t1.dayGan]+ZHI[t1.dayZhi]);
  console.log("  月柱:", GAN[t1.monthGan]+ZHI[t1.monthZhi]);
  console.log("  时柱:", GAN[t1.hourGan]+ZHI[t1.hourZhi]);

  const t2 = computeBazi({name:"测试", gender:"男", y:2024, m:2, d:3, hour:12});
  console.log("测试2 2024-02-03 12:00 男（立春前）");
  console.log("  年柱:", GAN[t2.yearGan]+ZHI[t2.yearZhi], "(应=癸卯)");
  console.log("  立春日期:", t2.lichun.y+"-"+t2.lichun.m+"-"+t2.lichun.d);

  const t3 = computeBazi({name:"测试", gender:"男", y:2024, m:2, d:10, hour:23});
  console.log("测试3 2024-02-10 23:00 男（晚子时）");
  console.log("  日柱:", GAN[t3.dayGan]+ZHI[t3.dayZhi], "时柱:", GAN[t3.hourGan]+ZHI[t3.hourZhi], "(应=子时)");

  const t4 = computeBazi({name:"毛泽东", gender:"男", y:1893, m:12, d:26, hour:12});
  console.log("测试4 1893-12-26 12:00 男（毛泽东）");
  console.log("  四柱:", t4.pillars.map(p=>GAN[p.gan]+ZHI[p.zhi]).join(" "));
  console.log("  日主:", GAN[t4.dayGan], "旺衰:", t4.strength, "喜用:", ELEM_NAME[t4.yong], ELEM_NAME[t4.xi]);

  const lc = getJieqiDateBeijing(2024, 315);
  console.log("测试5 2024立春:", lc.y+"-"+lc.m+"-"+lc.d+" "+lc.hour+":"+lc.minute, "(应≈2-4/5)");
}
