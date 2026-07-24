import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const ROOT = process.cwd();
const SUMMARY_PATH = path.join(ROOT, "data", "korean-summaries.json");
const PAPERS_PATH = path.join(ROOT, "data", "papers.json");
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const DAYS_BACK = Number(process.env.DAYS_BACK || 365);
const MAX_NEW_SUMMARIES = Number(process.env.MAX_NEW_SUMMARIES || 30);
const RESULTS_PER_JOURNAL = Number(process.env.RESULTS_PER_JOURNAL || 20);

const JOURNALS = [
  "Journal of Veterinary Cardiology",
  "Journal of Veterinary Internal Medicine",
  "American Journal of Veterinary Research",
  "Journal of Small Animal Practice",
  "Journal of the American Veterinary Medical Association",
  "Veterinary Medicine and Science",
  "Frontiers in Veterinary Science",
  "Veterinary Record",
  "The Veterinary Journal",
  "BMC Veterinary Research",
  "Veterinary Research Communications",
  "Journal of Veterinary Medical Science",
  "Topics in Companion Animal Medicine",
  "Journal of Feline Medicine and Surgery",
  "JFMS Open Reports",
  "Veterinary and Comparative Oncology",
  "Veterinary Sciences",
  "Veterinary Surgery",
  "Veterinary and Comparative Orthopaedics and Traumatology",
  "Veterinary Radiology & Ultrasound",
  "Veterinary Dermatology"
];

const CATEGORY_JOURNALS = {
  cardiology: [
    "Journal of Veterinary Cardiology",
    "Journal of Veterinary Internal Medicine",
    "American Journal of Veterinary Research",
    "Journal of Small Animal Practice",
    "Journal of the American Veterinary Medical Association",
    "Veterinary Medicine and Science",
    "Frontiers in Veterinary Science"
  ],
  internalMedicine: [
    "Journal of Veterinary Internal Medicine",
    "Veterinary Record",
    "The Veterinary Journal",
    "BMC Veterinary Research",
    "Veterinary Research Communications",
    "Journal of Veterinary Medical Science",
    "Topics in Companion Animal Medicine",
    "Journal of Feline Medicine and Surgery",
    "JFMS Open Reports"
  ],
  oncology: [
    "Journal of Veterinary Internal Medicine",
    "Veterinary and Comparative Oncology",
    "Veterinary Sciences",
    "Frontiers in Veterinary Science",
    "Journal of Small Animal Practice",
    "Veterinary Medicine and Science"
  ],
  surgery: [
    "Veterinary Surgery",
    "Veterinary and Comparative Orthopaedics and Traumatology",
    "Veterinary Radiology & Ultrasound",
    "Journal of Small Animal Practice"
  ],
  neurology: [
    "Journal of Veterinary Internal Medicine",
    "Veterinary Record",
    "Frontiers in Veterinary Science",
    "Journal of Veterinary Medical Science",
    "BMC Veterinary Research"
  ],
  dermatology: [
    "Veterinary Dermatology",
    "Veterinary Sciences",
    "BMC Veterinary Research",
    "Veterinary Research Communications",
    "Journal of Feline Medicine and Surgery"
  ]
};

const JOURNAL_ALIASES = {
  "J Vet Cardiol": "Journal of Veterinary Cardiology",
  "J Vet Intern Med": "Journal of Veterinary Internal Medicine",
  "Am J Vet Res": "American Journal of Veterinary Research",
  "J Small Anim Pract": "Journal of Small Animal Practice",
  "J Am Vet Med Assoc": "Journal of the American Veterinary Medical Association",
  "Vet Med Sci": "Veterinary Medicine and Science",
  "Front Vet Sci": "Frontiers in Veterinary Science",
  "Vet Rec": "Veterinary Record",
  "Vet J": "The Veterinary Journal",
  "BMC Vet Res": "BMC Veterinary Research",
  "Vet Res Commun": "Veterinary Research Communications",
  "J Vet Med Sci": "Journal of Veterinary Medical Science",
  "Top Companion Anim Med": "Topics in Companion Animal Medicine",
  "J Feline Med Surg": "Journal of Feline Medicine and Surgery",
  "JFMS Open Rep": "JFMS Open Reports",
  "Vet Comp Oncol": "Veterinary and Comparative Oncology",
  "Vet Sci": "Veterinary Sciences",
  "Vet Surg": "Veterinary Surgery",
  "Vet Comp Orthop Traumatol": "Veterinary and Comparative Orthopaedics and Traumatology",
  "Vet Radiol Ultrasound": "Veterinary Radiology & Ultrasound",
  "Vet Dermatol": "Veterinary Dermatology"
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function speciesTerms() {
  return [
    "dog[Title/Abstract]", "dogs[Title/Abstract]", "canine[Title/Abstract]",
    "cat[Title/Abstract]", "cats[Title/Abstract]", "feline[Title/Abstract]"
  ].join(" OR ");
}

function queryForJournal(journal) {
  return `("${journal}"[Journal] AND (${speciesTerms()}))`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchIdsByJournal(base) {
  const allIds = [];
  for (const journal of JOURNALS) {
    const term = encodeURIComponent(queryForJournal(journal));
    const url =
      `${base}/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date` +
      `&retmax=${RESULTS_PER_JOURNAL}&reldate=${DAYS_BACK}&datetype=pdat&term=${term}`;

    const data = await fetchJson(url);
    const ids = data?.esearchresult?.idlist || [];
    console.log(`${journal}: ${ids.length}편`);
    allIds.push(...ids);
    await sleep(350);
  }
  return [...new Set(allIds)];
}

function decodeXml(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function firstTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function normalizeJournal(raw = "") {
  const clean = raw.replace(/\.$/, "").trim();
  return JOURNAL_ALIASES[clean] || clean;
}

function categoriesFor(journal) {
  return Object.entries(CATEGORY_JOURNALS)
    .filter(([, journals]) => journals.includes(journal))
    .map(([category]) => category);
}

function parseArticles(xmlText) {
  const blocks = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  return blocks.map(block => {
    const pmid = firstTag(block, "PMID");
    const title = firstTag(block, "ArticleTitle");
    const journal = normalizeJournal(firstTag(block, "Title"));
    const abstract = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi)]
      .map(match => decodeXml(match[1])).join(" ");

    const authors = [...block.matchAll(/<Author\b[\s\S]*?<\/Author>/gi)].map(match => {
      const authorBlock = match[0];
      const collective = firstTag(authorBlock, "CollectiveName");
      if (collective) return collective;
      const last = firstTag(authorBlock, "LastName");
      const initials = firstTag(authorBlock, "Initials");
      return [last, initials].filter(Boolean).join(" ");
    }).filter(Boolean).join(", ");

    const year = firstTag(block, "Year");
    const month = firstTag(block, "Month");
    const day = firstTag(block, "Day");
    const medlineDate = firstTag(block, "MedlineDate");
    const date = [year, month, day].filter(Boolean).join(" ") || medlineDate || year || "";

    return {
      pmid, title, journal, authors, date,
      dateObject: date || "1970-01-01",
      abstract,
      categories: categoriesFor(journal)
    };
  }).filter(article =>
    article.pmid &&
    article.title &&
    JOURNALS.includes(article.journal)
  );
}

async function summarize(article) {
  const prompt = `
다음은 개 또는 고양이 임상 수의학 논문의 제목과 초록이다.

제목: ${article.title}
저널: ${article.journal}
초록:
${article.abstract}

한국의 임상 수의사가 빠르게 논문을 선별할 수 있도록 한국어로 요약하라.

반드시 다음 JSON 객체만 출력한다.
{
  "brief_summary": "2~4문장. 연구 대상과 목적, 핵심 결과, 임상적 의미를 포함한다.",
  "detailed_summary": "5~8문장. 연구 설계, 대상, 주요 평가 항목, 핵심 수치 또는 방향성, 결론과 중요한 제한점을 정확하게 설명한다."
}

규칙:
- 초록에 없는 내용을 추정하거나 추가하지 않는다.
- 유의성과 인과관계를 과장하지 않는다.
- 수치, 표본 수, 약물명, 질환명은 가능한 한 유지한다.
- 수의학 용어는 자연스러운 한국 임상 용어로 번역하고 필요한 영문 약어는 병기한다.
- 증례보고라면 일반화하지 않는다.
`.trim();

  const response = await client.responses.create({ model: MODEL, input: prompt });
  const raw = response.output_text.trim()
    .replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(raw);
  if (!parsed.brief_summary || !parsed.detailed_summary) {
    throw new Error("요약 JSON 필드가 누락되었습니다.");
  }
  return parsed;
}

async function readStoredSummaries() {
  try {
    return JSON.parse(await fs.readFile(SUMMARY_PATH, "utf8"));
  } catch {
    return { updated_at: null, summaries: {} };
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY GitHub Secret이 설정되지 않았습니다.");
  }

  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const ids = await fetchIdsByJournal(base);
  if (!ids.length) throw new Error("PubMed에서 논문 PMID를 가져오지 못했습니다.");

  const articles = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const xml = await fetchText(
      `${base}/efetch.fcgi?db=pubmed&retmode=xml&id=${batch.join(",")}`
    );
    articles.push(...parseArticles(xml));
    await sleep(350);
  }

  const unique = [...new Map(articles.map(article => [article.pmid, article])).values()]
    .sort((a, b) => new Date(b.dateObject) - new Date(a.dateObject));

  await fs.writeFile(PAPERS_PATH, JSON.stringify({
    updated_at: new Date().toISOString(),
    papers: unique
  }, null, 2) + "\n");

  const stored = await readStoredSummaries();
  const pending = unique
    .filter(article => article.abstract && !stored.summaries[article.pmid])
    .slice(0, MAX_NEW_SUMMARIES);

  console.log(`전체 ${unique.length}편 저장, 신규 한글 요약 ${pending.length}편`);

  for (const [index, article] of pending.entries()) {
    try {
      console.log(`[${index + 1}/${pending.length}] PMID ${article.pmid}`);
      const summary = await summarize(article);
      stored.summaries[article.pmid] = {
        ...summary,
        title: article.title,
        journal: article.journal,
        generated_at: new Date().toISOString(),
        model: MODEL
      };
      await fs.writeFile(SUMMARY_PATH, JSON.stringify(stored, null, 2) + "\n");
    } catch (error) {
      console.error(`PMID ${article.pmid} 요약 실패:`, error.message);
    }
  }

  stored.updated_at = new Date().toISOString();
  await fs.writeFile(SUMMARY_PATH, JSON.stringify(stored, null, 2) + "\n");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
