const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "LICENSE");
const outputPath = path.join(projectRoot, "LICENSE.rtf");
const source = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");

const encodeCharacter = (character) => {
  if (character === "\\" || character === "{" || character === "}") return `\\${character}`;
  if (character === "\n") return "\\par\n";
  if (character === "\r") return "";
  const codePoint = character.codePointAt(0);
  if (codePoint >= 0x20 && codePoint <= 0x7e) return character;
  const units = [];
  if (codePoint <= 0xffff) units.push(codePoint);
  else {
    const adjusted = codePoint - 0x10000;
    units.push(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
  }
  return units.map((unit) => `\\u${unit > 0x7fff ? unit - 0x10000 : unit}?`).join("");
};

const body = Array.from(source).map(encodeCharacter).join("");
const rtf = `{\\rtf1\\ansi\\ansicpg949\\deff0{\\fonttbl{\\f0\\fnil\\fcharset129 Malgun Gothic;}}\\viewkind4\\uc1\\pard\\f0\\fs18 ${body}\\par}`;
fs.writeFileSync(outputPath, rtf, "ascii");
console.log(`Generated ${path.basename(outputPath)} with Unicode RTF escapes.`);
