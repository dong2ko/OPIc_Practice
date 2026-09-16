import { describe, expect, it } from "vitest";
import { parseStudyGuideHtml, selectedImportPayload } from "./importers";

const hash = "a".repeat(64);

describe("review-first study guide import", () => {
  it("preserves questions, subquestions, answers, Korean analysis, and guide articles", () => {
    const value = parseStudyGuideHtml(`
      <h1>SMART review</h1>
      <p>Instructional content stays separate.</p>
      <h2>Home</h2>
      <p>Topic strategy.</p>
      <h3>Q001 | Description | My home</h3>
      <p class="small">원자료 문항 DOCX ¶10–12</p>
      <p class="question">Where do you live?</p>
      <p class="question">How many rooms does it have?</p>
      <p class="analysis">질문 의도 집을 자세히 설명한다.</p>
      <p class="answer">I live in a small studio.</p>
      <p class="answer">It has one main room.</p>
      <p class="analysis">구조 분석 핵심에서 세부 정보로 연결한다.</p>
      <p class="analysis">재사용 표현 what I like most is = 내가 가장 좋아하는 점은</p>
    `, "fixture.docx", hash);

    expect(value.questions).toHaveLength(1);
    expect(value.questions[0].prompt).toContain("Where do you live?\n\nHow many rooms");
    expect(value.questions[0].answers[0].englishText).toContain("studio.\n\nIt has");
    expect(value.questions[0].answers[0].koreanExplanation).toContain("집을 자세히");
    expect(value.questions[0].expressions[0].phrase).toBe("what I like most is");
    expect(value.guides.map((item) => item.body).join(" ")).toContain("Instructional content stays separate");
    expect(value.questions[0].reviewReasons).toContain("Multiple question paragraphs were preserved and should be reviewed as possible subquestions.");
  });

  it("marks missing answers instead of inventing one", () => {
    const value = parseStudyGuideHtml(`
      <h1>Question bank</h1><h2>Music</h2><h3>Q2 | Habit | Listening</h3>
      <p class="question">When do you listen to music?</p>
    `, "fixture.docx", hash);
    expect(value.questions[0].answers).toEqual([]);
    expect(value.questions[0].reviewReasons).toContain("No answer was found; it will remain marked as missing.");
  });

  it("flags repeated prompts and filters unselected candidates", () => {
    const value = parseStudyGuideHtml(`
      <h1>Bank</h1><h2>Home</h2>
      <h3>Q1 | Description | A</h3><p class="question">Describe your home.</p><p class="answer">A.</p>
      <h3>Q2 | Description | B</h3><p class="question">Describe your home.</p><p class="answer">B.</p>
    `, "fixture.docx", hash);
    expect(value.questions.every((item) => item.reviewReasons.includes("Possible duplicate prompt in this import."))).toBe(true);
    value.questions[0].selected = false;
    expect(selectedImportPayload(value).questions).toHaveLength(1);
  });

  it("keeps markup as inert text", () => {
    const value = parseStudyGuideHtml(`
      <h1>Bank</h1><h2>Home</h2><h3>Q1 | Description | Safety</h3>
      <p class="question">&lt;script&gt;doNotRun()&lt;/script&gt;</p><p class="answer">Safe text</p>
    `, "fixture.docx", hash);
    expect(value.questions[0].prompt).toBe("<script>doNotRun()</script>");
    expect(document.querySelector("script")).toBeNull();
  });
});
