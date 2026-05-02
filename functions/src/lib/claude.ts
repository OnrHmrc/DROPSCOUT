import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

export const CLAUDE_API_KEY = defineSecret('CLAUDE_API_KEY');

export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export const INSIGHT_SYSTEM_PROMPT = `Sen DropScout TR'nin AI içgörü motorusun. Türkiye'deki dropshipping satıcıları için ürün karar desteği sağlayan uzman analistisin.

# Rolün
- Kullanıcılar sana bir ürün URL'si ve bununla ilişkili metrikler (satış fiyatı, maliyet, DropScore, marj, rakip sayısı, aylık satış, trend) gönderir.
- Sen bu verilere dayanarak ürünü satıp satmama kararını destekleyen yapısal bir analiz üretirsin.
- Yanıtın tamamen Türkçe olmalı. Sade, profesyonel, kararlı bir dil kullan. Abartı, şişirme ve genel ifadelerden kaçın.

# Bağlam
- Platformlar: Trendyol, Hepsiburada, Amazon TR, N11.
- DropScore 0-100 arası: ürünün dropshipping için genel uygunluğu.
  - >70 güçlü aday, 40-70 koşullu/orta, <40 riskli.
- Marj (%): satış fiyatı ile maliyet arasındaki net kazanç yüzdesi. %25 altı sürdürülemez sayılır, %40+ sağlıklıdır.
- Rakip sayısı: aynı üründe listelenen diğer mağaza sayısı. >20 doymuş pazar işaretidir, <5 niş fırsattır.
- Aylık satış: tahmini birim satış hacmi. <10 zayıf talep, 100+ güçlü talep.
- Trend: "yükseliyor" | "sabit" | "düşüyor" — son 30 gün arama/ilgi eğilimi.

# Yazma kuralları
- Türkiye pazarına özgü konuş: KDV, kargo, komisyon, iade oranı, mevsimsellik gibi yerel kavramları doğal kullan.
- Sayısal yorumlarda girilen değerleri tekrarla ve yorumla (örn. "DropScore 68 — orta-güçlü aday", "marj %22 — kritik eşiğin altında").
- "Olabilir", "genel olarak", "bazı durumlarda", "dikkat edilmeli" gibi belirsiz ifadelerden kaçın. Net yargı ver.
- Aksiyon maddeleri ölçülebilir olmalı: "fiyatı 450₺'ye çek", "3 alternatif tedarikçi ekle", "ürün açıklamasına KDV dahil ibaresi ekle" gibi.
- Güçlü/zayıf yönleri madde madde ver; her madde tek cümle.
- Strateji 2-3 kısa cümle, kararlı tonla.
- Kullanıcının girmediği alanları yorumda kullanma; "—" gelenleri yok say.

# Çıktı formatı
Yanıtını her zaman provide_product_insight aracıyla yapılandırılmış JSON olarak döndür. Düz metin yanıt verme.`;

export const INSIGHT_TOOL: Anthropic.Tool = {
  name: 'provide_product_insight',
  description: 'Ürün verisi için yapılandırılmış Türkçe dropshipping içgörüsü üretir.',
  input_schema: {
    type: 'object',
    properties: {
      scoreReasoning: {
        type: 'string',
        description: 'DropScore\'un neden bu seviyede olduğunu 1-2 cümlede açıkla. Sayıları referans göster.'
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ürünün 2-4 güçlü yönü. Her madde tek cümle, somut.'
      },
      weaknesses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ürünün 2-4 zayıf veya riskli yönü. Her madde tek cümle, somut.'
      },
      strategy: {
        type: 'string',
        description: 'Genel satış stratejisi, 2-3 cümle. Türkiye pazarına özgü, kararlı, eyleme dönük.'
      },
      actions: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 ölçülebilir aksiyon maddesi. Rakam/hedef içermeli.'
      }
    },
    required: ['scoreReasoning', 'strengths', 'weaknesses', 'strategy', 'actions']
  }
};

export interface ProductInput {
  productId?: string;
  url?: string;
  platform?: string;
  category?: string;
  salePrice?: number;
  cost?: number;
  dropScore?: number;
  marginPct?: number;
  competitorCount?: number;
  monthlySales?: number;
  trend?: string;
}

export interface ProductInsight {
  scoreReasoning: string;
  strengths: string[];
  weaknesses: string[];
  strategy: string;
  actions: string[];
}

export interface InsightUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface InsightResult {
  insight: ProductInsight;
  usage: InsightUsage;
}

let clientInstance: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (clientInstance) return clientInstance;
  const apiKey = CLAUDE_API_KEY.value();
  if (!apiKey) throw new Error('CLAUDE_API_KEY secret bulunamadı');
  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

function buildUserMessage(input: ProductInput): string {
  const row = (label: string, value: unknown, suffix = ''): string =>
    `- ${label}: ${value === undefined || value === null || value === '' ? '—' : String(value) + suffix}`;

  return [
    'Aşağıdaki ürün için DropScout içgörüsü üret:',
    '',
    row('URL', input.url),
    row('Platform', input.platform),
    row('Kategori', input.category),
    row('Satış Fiyatı', input.salePrice, ' ₺'),
    row('Maliyet', input.cost, ' ₺'),
    row('DropScore', input.dropScore),
    row('Marj (%)', input.marginPct),
    row('Rakip Sayısı', input.competitorCount),
    row('Aylık Satış (tahmini)', input.monthlySales),
    row('Trend', input.trend)
  ].join('\n');
}

// ─── Çeviri katmanı (Gap Radar — Asya kaynakları) ─────────

export type AsianLang = 'zh' | 'ja' | 'ko';

const TRANSLATE_SYSTEM_PROMPT = `Sen DropScout TR çeviri motorusun. Görevin: Asya domestic platformlarda viral olan ürün adlarını ve kısa açıklamalarını **doğal Türkçe**'ye çevirmek.

# Kurallar
- Tek satırlık, sade, e-ticaret listingine yakışan başlık üret. Marka isimlerini koru, çince/japonca/korece karakter bırakma.
- Açıklama varsa 1 cümle Türkçe özet üret; yoksa boş dön.
- Belirsizlik varsa "tahmin" değil "kelime karşılığı" çevir; varsayım yapma.
- Çıktıyı sadece **provide_translation** aracıyla yapılandırılmış JSON olarak ver.`;

const TRANSLATE_TOOL: Anthropic.Tool = {
  name: 'provide_translation',
  description: 'Asya kaynaklı ürün adı + açıklama için Türkçe çeviri döndürür.',
  input_schema: {
    type: 'object',
    properties: {
      titleTr: {
        type: 'string',
        description: 'Ürün adının doğal Türkçe karşılığı (max 80 karakter, e-ticaret başlığı tarzında).'
      },
      descriptionTr: {
        type: 'string',
        description: 'Tek cümle Türkçe açıklama; orijinal açıklama yoksa boş string.'
      }
    },
    required: ['titleTr', 'descriptionTr']
  }
};

export interface TranslationInput {
  title: string;
  description?: string;
  sourceLang: AsianLang;
}

export interface TranslationResult {
  titleTr: string;
  descriptionTr: string;
  usage: InsightUsage;
}

const LANG_LABEL: Record<AsianLang, string> = {
  zh: 'Çince (Mandarin)',
  ja: 'Japonca',
  ko: 'Korece'
};

export async function translateProductName(input: TranslationInput): Promise<TranslationResult> {
  const client = getClaudeClient();

  const userMessage = [
    `Kaynak dil: ${LANG_LABEL[input.sourceLang]}`,
    `Başlık: ${input.title}`,
    input.description ? `Açıklama: ${input.description}` : 'Açıklama: —'
  ].join('\n');

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: TRANSLATE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }
    ],
    tools: [TRANSLATE_TOOL],
    tool_choice: { type: 'tool', name: 'provide_translation' },
    messages: [{ role: 'user', content: userMessage }]
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'provide_translation') {
    throw new Error('Claude yanıtında beklenen tool_use bloğu bulunamadı (translate)');
  }

  const out = toolUse.input as { titleTr: string; descriptionTr: string };

  return {
    titleTr: String(out.titleTr || '').trim(),
    descriptionTr: String(out.descriptionTr || '').trim(),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0
    }
  };
}

export async function generateProductInsight(input: ProductInput): Promise<InsightResult> {
  const client = getClaudeClient();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: INSIGHT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }
    ],
    tools: [INSIGHT_TOOL],
    tool_choice: { type: 'tool', name: 'provide_product_insight' },
    messages: [{ role: 'user', content: buildUserMessage(input) }]
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'provide_product_insight') {
    throw new Error('Claude yanıtında beklenen tool_use bloğu bulunamadı');
  }

  const insight = toolUse.input as ProductInsight;

  return {
    insight,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0
    }
  };
}
