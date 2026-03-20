import { human2SurfaceAnchors } from './human2Anchors'
import type { Acupoint, BodyRegion, Meridian, Side, SurfaceAnchor, Vector3Tuple } from '../types'

interface BilateralSeed {
  key: string
  name: string
  aliases: string[]
  meridian: Meridian
  bodyRegion: BodyRegion
  x: number
  y: number
  z: number
  summary: string
  location: string
  indications: string[]
  contraindications: string[]
  acupuncture: string
  moxibustion: string
  needleAngle?: Vector3Tuple
  trail?: 'circle' | 'line' | 'pulse'
}

interface CenterSeed extends Omit<BilateralSeed, 'x'> {
  x?: number
  side?: Side
}

const transformPosition = (bodyRegion: BodyRegion, [x, y, z]: Vector3Tuple): Vector3Tuple => {
  const baseX = x * 0.58
  const baseY = y * 1.08 + 0.02 + Math.max(y - 1, 0) * 0.14
  const baseZ = z * 0.72

  switch (bodyRegion) {
    case 'head':
      return [
        baseX * 0.56,
        baseY + 0.06,
        z >= 0 ? baseZ * 0.9 + 0.11 : baseZ * 0.82 - 0.03,
      ]
    case 'neck':
      return [baseX * 0.72, baseY + 0.05, baseZ * 0.78]
    case 'chest':
      return [baseX * 0.86, baseY + 0.04, z >= 0 ? baseZ * 0.9 + 0.03 : baseZ * 0.88]
    case 'abdomen':
      return [baseX * 0.84, baseY + 0.03, z >= 0 ? baseZ * 0.92 + 0.02 : baseZ * 0.9]
    case 'back':
      return [baseX * 0.88, baseY + 0.06, baseZ * 0.92 - 0.02]
    case 'arm':
      return [baseX * 0.96, baseY + 0.03, baseZ * 0.96]
    case 'hand':
      return [baseX, baseY + 0.01, baseZ]
    case 'leg':
      return [baseX * 0.9, baseY + 0.01, baseZ * 0.94]
    case 'foot':
      return [baseX * 0.86, baseY - 0.01, baseZ * 0.98]
    default:
      return [baseX, baseY, baseZ]
  }
}

const createCameraPreset = (position3d: Vector3Tuple) => ({
  position: [position3d[0] * 1.88, position3d[1] + 0.18, position3d[2] + 3.1] as Vector3Tuple,
  target: position3d,
})

const resolveSurfaceAnchor = (
  id: string,
  bodyRegion: BodyRegion,
  rawPosition: Vector3Tuple,
): { position3d: Vector3Tuple; surfaceAnchor?: SurfaceAnchor } => {
  const surfaceAnchor = human2SurfaceAnchors[id]
  if (surfaceAnchor) {
    return {
      position3d: surfaceAnchor.position,
      surfaceAnchor,
    }
  }

  return {
    position3d: transformPosition(bodyRegion, rawPosition),
  }
}

const createBilateralAcupoint = (seed: BilateralSeed): Acupoint[] =>
  ([
    ['left', -Math.abs(seed.x)],
    ['right', Math.abs(seed.x)],
  ] as const).map(([side, x]) => {
    const id = `${seed.key}-${side}`
    const { position3d, surfaceAnchor } = resolveSurfaceAnchor(id, seed.bodyRegion, [x, seed.y, seed.z])
    return {
      id,
      name: `${seed.name}${side === 'left' ? '（左）' : '（右）'}`,
      aliases: seed.aliases,
      meridian: seed.meridian,
      bodyRegion: seed.bodyRegion,
      side,
      position3d,
      surfaceAnchor,
      cameraPreset: createCameraPreset(position3d),
      summary: seed.summary,
      location: seed.location,
      indications: seed.indications,
      contraindications: seed.contraindications,
      acupuncture: seed.acupuncture,
      moxibustion: seed.moxibustion,
      animationProfile: {
        acupuncture: {
          angle: seed.needleAngle ?? [0, 0, 1],
          depth: 0.15,
          needleLength: 0.05,
          effectRadius: 0.16,
        },
        moxibustion: {
          radius: 0.2,
          intensity: 0.9,
          hoverHeight: 0.28,
          duration: 2.2,
          trail: seed.trail ?? 'pulse',
        },
      },
    }
  })

const createCenterAcupoint = (seed: CenterSeed): Acupoint => {
  const { position3d, surfaceAnchor } = resolveSurfaceAnchor(seed.key, seed.bodyRegion, [
    seed.x ?? 0,
    seed.y,
    seed.z,
  ])
  return {
    id: seed.key,
    name: seed.name,
    aliases: seed.aliases,
    meridian: seed.meridian,
    bodyRegion: seed.bodyRegion,
    side: seed.side ?? 'center',
    position3d,
    surfaceAnchor,
    cameraPreset: createCameraPreset(position3d),
    summary: seed.summary,
    location: seed.location,
    indications: seed.indications,
    contraindications: seed.contraindications,
    acupuncture: seed.acupuncture,
    moxibustion: seed.moxibustion,
    animationProfile: {
      acupuncture: {
        angle: seed.needleAngle ?? [0, 0, 1],
        depth: 0.14,
        needleLength: 0.045,
        effectRadius: 0.16,
      },
      moxibustion: {
        radius: 0.22,
        intensity: 1,
        hoverHeight: 0.3,
        duration: 2.6,
        trail: seed.trail ?? 'pulse',
      },
    },
  }
}

const bilateralSeeds: BilateralSeed[] = [
  {
    key: 'hegu',
    name: '合谷',
    aliases: ['LI4', 'Hegu'],
    meridian: '手阳明大肠经',
    bodyRegion: 'hand',
    x: 0.6,
    y: 0.98,
    z: 0.18,
    summary: '常用醒神止痛要穴，适合前端教学演示和手部定位。',
    location: '手背第一、二掌骨间，当第二掌骨桡侧的中点处。',
    indications: ['头痛', '牙痛', '感冒', '面口部不适'],
    contraindications: ['孕期慎刺激'],
    acupuncture: '直刺或斜刺，演示以手背向内的浅层进针为主。',
    moxibustion: '以局部温热舒适为宜，可配合短时温和灸演示。',
    needleAngle: [0.18, -0.12, 1],
    trail: 'line',
  },
  {
    key: 'quchi',
    name: '曲池',
    aliases: ['LI11', 'Quchi'],
    meridian: '手阳明大肠经',
    bodyRegion: 'arm',
    x: 0.96,
    y: 1.55,
    z: 0.14,
    summary: '上肢常用穴，便于展示肘部外侧定位。',
    location: '屈肘成直角，肘横纹外端凹陷处。',
    indications: ['上肢疼痛', '发热', '皮肤瘙痒'],
    contraindications: ['局部皮肤破损时避免刺激'],
    acupuncture: '多用直刺，动画表现为肘外侧入针和局部波纹。',
    moxibustion: '温和灸或回旋灸，适合展示沿肘部短轨迹热区。',
    needleAngle: [0.1, -0.1, 1],
    trail: 'circle',
  },
  {
    key: 'neiguan',
    name: '内关',
    aliases: ['PC6', 'Neiguan'],
    meridian: '手厥阴心包经',
    bodyRegion: 'arm',
    x: 0.54,
    y: 1.18,
    z: 0.28,
    summary: '上肢内侧代表穴，适合演示不同经络筛选。',
    location: '前臂掌侧，腕横纹上约两寸，两筋之间。',
    indications: ['胸闷', '恶心', '心悸', '失眠'],
    contraindications: ['严重出血倾向者慎用'],
    acupuncture: '演示为掌侧向里斜刺，配合轻微脉动光效。',
    moxibustion: '温和灸，热区范围较小以避免遮挡手腕。',
    needleAngle: [0, -0.08, 1],
  },
  {
    key: 'waiguan',
    name: '外关',
    aliases: ['SJ5', 'Waiguan'],
    meridian: '手少阳三焦经',
    bodyRegion: 'arm',
    x: 0.58,
    y: 1.2,
    z: 0.02,
    summary: '前臂外侧常用穴，适合与内关形成对照演示。',
    location: '前臂背侧，腕背横纹上两寸，尺桡骨之间。',
    indications: ['偏头痛', '肩背痛', '耳鸣'],
    contraindications: ['局部炎症时避免灸法过强'],
    acupuncture: '以背侧浅刺为主，动画突出进针方向差异。',
    moxibustion: '局部回旋灸，光效更偏橙色暖调。',
    needleAngle: [0, -0.12, 1],
  },
  {
    key: 'shousanli',
    name: '手三里',
    aliases: ['LI10', 'Shousanli'],
    meridian: '手阳明大肠经',
    bodyRegion: 'arm',
    x: 0.82,
    y: 1.28,
    z: 0.12,
    summary: '前臂阳明经代表穴，适合作为上肢路径演示节点。',
    location: '在曲池下二寸，阳溪与曲池连线上。',
    indications: ['手臂无力', '肘臂疼痛', '消化不适'],
    contraindications: ['急性外伤肿胀期谨慎使用'],
    acupuncture: '演示为前臂外侧直刺。',
    moxibustion: '温和灸，可用短时间脉冲热区。',
    needleAngle: [0.04, -0.06, 1],
  },
  {
    key: 'zusanli',
    name: '足三里',
    aliases: ['ST36', 'Zusanli'],
    meridian: '足阳明胃经',
    bodyRegion: 'leg',
    x: 0.32,
    y: 0.56,
    z: 0.2,
    summary: '下肢标志性穴位，适合做默认演示案例。',
    location: '外膝眼下三寸，胫骨前嵴外一横指处。',
    indications: ['胃痛', '乏力', '膝腿酸胀', '调理脾胃'],
    contraindications: ['局部感染或高热时慎灸'],
    acupuncture: '演示为膝下外侧直刺，伴随稳定扩散波纹。',
    moxibustion: '温和灸或雀啄灸，适合展示热区渐变。',
    needleAngle: [0, -0.1, 1],
    trail: 'circle',
  },
  {
    key: 'sanyinjiao',
    name: '三阴交',
    aliases: ['SP6', 'Sanyinjiao'],
    meridian: '足太阴脾经',
    bodyRegion: 'leg',
    x: 0.22,
    y: 0.42,
    z: 0.18,
    summary: '内踝上方常用穴，适合做内外侧部位对照。',
    location: '内踝尖上三寸，胫骨内侧缘后际。',
    indications: ['失眠', '脾胃虚弱', '下肢冷痛'],
    contraindications: ['孕期避免重刺激'],
    acupuncture: '内侧斜刺，动画更强调方向性。',
    moxibustion: '温和灸，局部热区稍收敛。',
    needleAngle: [0.08, -0.05, 1],
    trail: 'pulse',
  },
  {
    key: 'yanglingquan',
    name: '阳陵泉',
    aliases: ['GB34', 'Yanglingquan'],
    meridian: '足少阳胆经',
    bodyRegion: 'leg',
    x: 0.4,
    y: 0.72,
    z: 0.1,
    summary: '膝外侧代表穴，适合展示侧面观察。',
    location: '腓骨小头前下方凹陷处。',
    indications: ['筋脉拘急', '膝痛', '下肢麻木'],
    contraindications: ['局部骨折恢复期慎刺'],
    acupuncture: '从外侧浅刺，适合侧面视角聚焦。',
    moxibustion: '局部温灸，配合线性摆动轨迹。',
    needleAngle: [0.12, -0.08, 1],
    trail: 'line',
  },
  {
    key: 'taixi',
    name: '太溪',
    aliases: ['KI3', 'Taixi'],
    meridian: '足少阴肾经',
    bodyRegion: 'foot',
    x: 0.16,
    y: 0.16,
    z: -0.06,
    summary: '内踝后方重要穴位，适合脚踝精细定位演示。',
    location: '内踝尖与跟腱之间的凹陷中。',
    indications: ['腰膝酸软', '耳鸣', '足跟痛'],
    contraindications: ['严重静脉炎区域避免刺激'],
    acupuncture: '局部浅刺，针体较短。',
    moxibustion: '热区集中，适合脉冲式热感表现。',
    needleAngle: [0.08, 0.04, 1],
  },
  {
    key: 'taichong',
    name: '太冲',
    aliases: ['LR3', 'Taichong'],
    meridian: '足厥阴肝经',
    bodyRegion: 'foot',
    x: 0.18,
    y: 0.04,
    z: 0.22,
    summary: '足背经典穴位，适合足部视图与搜索演示。',
    location: '足背第一、二跖骨结合部前方凹陷处。',
    indications: ['情志不舒', '头痛', '目赤', '足背胀痛'],
    contraindications: ['足背开放性伤口时禁用'],
    acupuncture: '足背向近端浅刺。',
    moxibustion: '温和灸，热区以椭圆扩散表现。',
    needleAngle: [0.04, 0.02, 1],
  },
  {
    key: 'xuehai',
    name: '血海',
    aliases: ['SP10', 'Xuehai'],
    meridian: '足太阴脾经',
    bodyRegion: 'leg',
    x: 0.26,
    y: 0.84,
    z: 0.18,
    summary: '大腿内侧常用穴，增强腿部区域覆盖。',
    location: '髌底内侧端上二寸，股四头肌内侧隆起处。',
    indications: ['皮肤瘙痒', '月经不调', '膝痛'],
    contraindications: ['大腿内侧静脉曲张区慎用'],
    acupuncture: '内侧浅刺，波纹范围适中。',
    moxibustion: '回旋灸，热区随时间渐扩。',
    needleAngle: [0.06, -0.08, 1],
  },
  {
    key: 'jianyu',
    name: '肩髃',
    aliases: ['LI15', 'Jianyu'],
    meridian: '手阳明大肠经',
    bodyRegion: 'arm',
    x: 0.88,
    y: 1.86,
    z: 0.12,
    summary: '肩部外侧代表穴，适合上半身局部聚焦。',
    location: '肩峰前下方凹陷处，上臂外展时更明显。',
    indications: ['肩周不适', '上肢抬举受限'],
    contraindications: ['急性肩关节损伤期慎刺'],
    acupuncture: '肩部局部直刺演示。',
    moxibustion: '肩峰周围回旋灸。',
    needleAngle: [0.12, -0.06, 1],
    trail: 'circle',
  },
  {
    key: 'tianzong',
    name: '天宗',
    aliases: ['SI11', 'Tianzong'],
    meridian: '手太阳小肠经',
    bodyRegion: 'back',
    x: 0.62,
    y: 1.62,
    z: -0.22,
    summary: '肩胛区常用穴，适合背部视图示范。',
    location: '肩胛冈中点与肩胛下角连线的上1/3与下2/3交点凹陷处。',
    indications: ['肩背痛', '颈项拘紧', '上肢酸麻'],
    contraindications: ['皮下出血倾向者慎刺'],
    acupuncture: '背面斜刺，需配合背部视角观察。',
    moxibustion: '背部局部温灸，热区偏圆形。',
    needleAngle: [0, -0.02, -1],
  },
  {
    key: 'feishu',
    name: '肺俞',
    aliases: ['BL13', 'Feishu'],
    meridian: '足太阳膀胱经',
    bodyRegion: 'back',
    x: 0.28,
    y: 1.74,
    z: -0.18,
    summary: '背俞穴示例，突出背部经络筛选。',
    location: '第三胸椎棘突下，旁开1.5寸。',
    indications: ['咳嗽', '气喘', '背部紧张'],
    contraindications: ['高热急性期不宜强灸'],
    acupuncture: '背部旁开直刺，波纹偏小。',
    moxibustion: '温和灸，暖色扩散更明显。',
    needleAngle: [0.04, -0.04, -1],
    trail: 'pulse',
  },
  {
    key: 'shenshu',
    name: '肾俞',
    aliases: ['BL23', 'Shenshu'],
    meridian: '足太阳膀胱经',
    bodyRegion: 'back',
    x: 0.28,
    y: 1.12,
    z: -0.16,
    summary: '腰背部代表穴，适合背部下半区内容演示。',
    location: '第二腰椎棘突下，旁开1.5寸。',
    indications: ['腰酸', '畏寒', '疲劳'],
    contraindications: ['局部皮肤敏感时灸量从小开始'],
    acupuncture: '背腰部浅刺，针体角度略向内。',
    moxibustion: '腰部温灸，热区半径稍大。',
    needleAngle: [0.04, -0.08, -1],
    trail: 'circle',
  },
  {
    key: 'fengchi',
    name: '风池',
    aliases: ['GB20', 'Fengchi'],
    meridian: '足少阳胆经',
    bodyRegion: 'neck',
    x: 0.24,
    y: 2.2,
    z: -0.18,
    summary: '颈后部常用穴，适合展示头颈局部聚焦。',
    location: '后发际平风府旁开约1.3寸，胸锁乳突肌与斜方肌之间凹陷处。',
    indications: ['头痛', '颈项强痛', '目眩'],
    contraindications: ['局部皮损时暂停灸法'],
    acupuncture: '从后颈向鼻尖方向缓慢斜刺的教学演示。',
    moxibustion: '短程温和灸，热区范围收敛。',
    needleAngle: [0.06, -0.08, -1],
  },
]

const centerSeeds: CenterSeed[] = [
  {
    key: 'baihui',
    name: '百会',
    aliases: ['DU20', 'Baihui'],
    meridian: '督脉',
    bodyRegion: 'head',
    y: 2.54,
    z: -0.02,
    summary: '头顶部中线穴位，适合作为首页主视觉的默认选中点。',
    location: '两耳尖连线与头顶正中线交点处。',
    indications: ['头晕', '失眠', '精神疲乏'],
    contraindications: ['高热烦躁时避免久灸'],
    acupuncture: '平刺或浅刺，动画强调头顶部轻微波纹扩散。',
    moxibustion: '温和灸，展示自上而下的暖光效果。',
    needleAngle: [0, -0.04, 1],
    trail: 'pulse',
  },
  {
    key: 'yintang',
    name: '印堂',
    aliases: ['EX-HN3', 'Yintang'],
    meridian: '督脉',
    bodyRegion: 'head',
    y: 2.28,
    z: 0.44,
    summary: '面部正中穴位，适合前视图和搜索示例。',
    location: '两眉头连线的中点。',
    indications: ['焦虑', '鼻塞', '头痛'],
    contraindications: ['面部敏感肌或破损时慎灸'],
    acupuncture: '平刺演示，针体长度较短。',
    moxibustion: '温和短时灸，热区半径较小。',
    needleAngle: [0, 0, 1],
  },
  {
    key: 'shanzhong',
    name: '膻中',
    aliases: ['RN17', 'Shanzhong'],
    meridian: '任脉',
    bodyRegion: 'chest',
    y: 1.72,
    z: 0.24,
    summary: '胸前任脉代表穴，适合胸腹区域过滤演示。',
    location: '前正中线上，平第四肋间隙处。',
    indications: ['胸闷', '咳嗽', '情绪紧张'],
    contraindications: ['胸前急性皮肤炎症时暂停灸法'],
    acupuncture: '多作平刺或浅刺，表现为胸前局部发光。',
    moxibustion: '温和灸，热区稳定且不大幅移动。',
    needleAngle: [0, -0.02, 1],
  },
  {
    key: 'qihai',
    name: '气海',
    aliases: ['RN6', 'Qihai'],
    meridian: '任脉',
    bodyRegion: 'abdomen',
    y: 1.18,
    z: 0.24,
    summary: '腹部保健常用穴，适合艾灸模式默认案例。',
    location: '前正中线上，脐下约1.5寸。',
    indications: ['乏力', '腹冷', '虚弱调理'],
    contraindications: ['高热或腹部急症时不宜自行灸治'],
    acupuncture: '腹部浅刺演示，波纹柔和。',
    moxibustion: '重点展示温热扩散与悬灸停留效果。',
    needleAngle: [0, -0.04, 1],
    trail: 'circle',
  },
  {
    key: 'guanyuan',
    name: '关元',
    aliases: ['RN4', 'Guanyuan'],
    meridian: '任脉',
    bodyRegion: 'abdomen',
    y: 1.02,
    z: 0.23,
    summary: '腹部中线经典穴位，利于教学中的任脉识别。',
    location: '前正中线上，脐下约3寸。',
    indications: ['疲劳', '畏寒', '腹部虚冷'],
    contraindications: ['孕期和急腹症状态需专业判断'],
    acupuncture: '局部浅刺，针感演示从中线向外扩散。',
    moxibustion: '温和灸，热区可略大于针刺波纹。',
    needleAngle: [0, -0.04, 1],
    trail: 'pulse',
  },
  {
    key: 'zhongwan',
    name: '中脘',
    aliases: ['RN12', 'Zhongwan'],
    meridian: '任脉',
    bodyRegion: 'abdomen',
    y: 1.44,
    z: 0.24,
    summary: '中焦核心穴位，适合与足三里形成联动浏览。',
    location: '前正中线上，脐上约4寸。',
    indications: ['胃脘不适', '腹胀', '食欲下降'],
    contraindications: ['腹部急痛时不建议自行强刺激'],
    acupuncture: '腹部平稳浅刺。',
    moxibustion: '暖光从中心均匀向外扩散。',
    needleAngle: [0, -0.04, 1],
    trail: 'circle',
  },
  {
    key: 'chengjiang',
    name: '承浆',
    aliases: ['RN24', 'Chengjiang'],
    meridian: '任脉',
    bodyRegion: 'head',
    y: 2.06,
    z: 0.48,
    summary: '口周中线穴位，适合面部穴位分布演示。',
    location: '颏唇沟正中凹陷处。',
    indications: ['面部麻木', '牙痛', '口干'],
    contraindications: ['口周破溃时避免操作'],
    acupuncture: '浅刺演示，面部波纹较细腻。',
    moxibustion: '仅做教学演示，不鼓励长时灸法展示。',
    needleAngle: [0, 0, 1],
  },
  {
    key: 'dazhui',
    name: '大椎',
    aliases: ['DU14', 'Dazhui'],
    meridian: '督脉',
    bodyRegion: 'neck',
    y: 2.02,
    z: -0.18,
    summary: '后颈正中穴位，适合作为背面模式默认点。',
    location: '第七颈椎棘突下凹陷中。',
    indications: ['颈肩僵硬', '畏寒', '发热'],
    contraindications: ['高热脱水时避免自行灸治'],
    acupuncture: '背面浅刺演示，针体朝下略倾。',
    moxibustion: '后颈局部温灸，适合展示暖色雾感。',
    needleAngle: [0, -0.08, -1],
    trail: 'line',
  },
  {
    key: 'mingmen',
    name: '命门',
    aliases: ['DU4', 'Mingmen'],
    meridian: '督脉',
    bodyRegion: 'back',
    y: 1.16,
    z: -0.16,
    summary: '腰部督脉标志穴，适合背腰部视角切换。',
    location: '第二腰椎棘突下凹陷中。',
    indications: ['腰酸', '虚寒', '疲劳'],
    contraindications: ['皮肤发炎区域禁灸'],
    acupuncture: '腰背部浅刺，局部波纹较克制。',
    moxibustion: '温和灸，热区半径略大于针刺效应。',
    needleAngle: [0, -0.08, -1],
    trail: 'circle',
  },
  {
    key: 'yaoyangguan',
    name: '腰阳关',
    aliases: ['DU3', 'Yaoyangguan'],
    meridian: '督脉',
    bodyRegion: 'back',
    y: 1.04,
    z: -0.15,
    summary: '腰骶过渡区穴位，用于扩展背部下方内容。',
    location: '第四腰椎棘突下凹陷中。',
    indications: ['腰腿痛', '下肢酸软'],
    contraindications: ['急性腰部损伤时避免强刺激'],
    acupuncture: '演示为腰部正中轻刺。',
    moxibustion: '暖色热区停留稍久，利于视觉识别。',
    needleAngle: [0, -0.08, -1],
  },
]

export const acupoints: Acupoint[] = [
  ...bilateralSeeds.flatMap(createBilateralAcupoint),
  ...centerSeeds.map(createCenterAcupoint),
]

export const meridians = Array.from(new Set(acupoints.map((point) => point.meridian)))

export const bodyRegions: Array<{ value: BodyRegion; label: string }> = [
  { value: 'head', label: '头面' },
  { value: 'neck', label: '颈项' },
  { value: 'chest', label: '胸部' },
  { value: 'abdomen', label: '腹部' },
  { value: 'back', label: '背腰' },
  { value: 'arm', label: '上肢' },
  { value: 'hand', label: '手部' },
  { value: 'leg', label: '下肢' },
  { value: 'foot', label: '足部' },
]
