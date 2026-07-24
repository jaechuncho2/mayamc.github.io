import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "korean-summaries.json");
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const DAYS_BACK = Number(process.env.DAYS_BACK || 21);
const MAX_NEW_SUMMARIES = Number(process.env.MAX_NEW_SUMMARIES || 30);

const CATEGORY_JOURNALS = [
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

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function query() {
  const journals = CATEGORY_JOURNALS.map(j => `"${j}"[Journal]`).join(" OR ");
  const species = [
    "dog[Title/Abstract]", "dogs[Title/Abstract]", "canine[Title/Abstract]",
    "cat[Title/Abstract]", "cats[Title/Abstract]", "feline[Title/Abstract]"
  ].join(" OR ");
  return `((${journals}) AND (${species}))`;
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

function parseArticles(xmlText) {
  const articles = [];
  const blocks = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  const text = (block, tag) => {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match
      ? match[1].replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">").replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s+/g, " ").trim()
      : "";
  };

  for (const block of blocks) {
    const pmid = text(block, "PMID");
    const title = text(block, "ArticleTitle");
    const abstractMatches = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi)];
    const abstract = abstractMatches
      .map(m => m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .join(" ");
    const journal = text(block, "Title");
    if (pmid && title && abstract) articles.push({ pmid, title, abstract, journal });
  }
  return articles;
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
- veterinary terminology는 자연스러운 한국 임상 용어로 번역하되 필요한 영문 약어는 병기한다.
- 증례보고라면 일반화하지 않는다.
`.trim();

  const response = await client.responses.create({
    model: MODEL,
    input: prompt
  });

  const raw = response.output_text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(raw);
  if (!parsed.brief_summary || !parsed.detailed_summary) {
    throw new Error("요약 JSON 필드가 누락되었습니다.");
  }
  return parsed;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY GitHub Secret이 설정되지 않았습니다.");
  }

  let stored = { updated_at: null, summaries: {} };
  try {
    stored = JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8"));
  } catch {
    // First run
  }

  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const term = encodeURIComponent(query());
  const searchUrl =
    `${base}/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=150` +
    `&reldate=${DAYS_BACK}&datetype=pdat&term=${term}`;
  const search = await fetchJson(searchUrl);
  const ids = search?.esearchresult?.idlist || [];

  if (!ids.length) {
    console.log("최근 대상 논문이 없습니다.");
    return;
  }

  const xml = await fetchText(
    `${base}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}`
  );
  const articles = parseArticles(xml);
  const pending = articles
    .filter(article => !stored.summaries[article.pmid])
    .slice(0, MAX_NEW_SUMMARIES);

  console.log(`검색 ${articles.length}편, 신규 요약 대상 ${pending.length}편`);

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
      await fs.writeFile(OUTPUT_PATH, JSON.stringify(stored, null, 2) + "\n");
    } catch (error) {
      console.error(`PMID ${article.pmid} 요약 실패:`, error.message);
    }
  }

  stored.updated_at = new Date().toISOString();
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(stored, null, 2) + "\n");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
