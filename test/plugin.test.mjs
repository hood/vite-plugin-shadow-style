import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "vite";

import { shadowStyle } from "../dist/plugin.js";

const TRICKY_CSS = [
  '.icon::before { content: "\\f101"; }',
  '.dash::after { content: "\\2014"; }',
  '.price::before { content: "$\'"; }',
  '.tpl::before { content: "${x}"; }',
  '.tick::before { content: "`"; }'
].join("\n");

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "shadow-style-"));
  await mkdir(join(root, "src"));
  for (const [name, content] of Object.entries(files))
    await writeFile(join(root, "src", name), content);
  return root;
}

async function bundle(
  root,
  { plugin = shadowStyle(), topLevel = true, build: buildConfig = {} } = {}
) {
  const warnings = [];
  const { lib, rollupOptions, ...rest } = buildConfig;
  const [output] = [].concat(
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: topLevel ? [plugin] : [],
      build: {
        write: false,
        minify: false,
        lib: {
          entry: join(root, "src/main.js"),
          formats: ["es"],
          fileName: "out",
          ...lib
        },
        ...rest,
        rollupOptions: {
          ...rollupOptions,
          plugins: topLevel ? [] : [plugin],
          onwarn: warning => warnings.push(warning.message)
        }
      }
    })
  );
  const chunk = output.output.find(file => file.type === "chunk");
  return { output: output.output, chunk, warnings };
}

const load = code =>
  import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

for (const topLevel of [true, false]) {
  test(`injects css verbatim (${topLevel ? "plugins" : "rollupOptions.plugins"})`, async () => {
    const root = await fixture({
      "style.css": TRICKY_CSS,
      "main.js": 'import "./style.css";\nexport const css = SHADOW_STYLE;\n'
    });
    const { chunk } = await bundle(root, { topLevel });
    const { css } = await load(chunk.code);

    assert.equal(css.trim(), TRICKY_CSS);
  });
}

test("replaces only references to the placeholder global", async () => {
  const root = await fixture({
    "style.css": ".a { color: red; }",
    "main.js": `import "./style.css";
const MY_SHADOW_STYLE_NOTE = "uses SHADOW_STYLE";
const obj = { SHADOW_STYLE: 1 };
export const note = MY_SHADOW_STYLE_NOTE;
export const prop = obj.SHADOW_STYLE;
export const first = SHADOW_STYLE;
export const second = { SHADOW_STYLE };
`
  });
  const { chunk } = await bundle(root);
  const mod = await load(chunk.code);

  assert.equal(mod.note, "uses SHADOW_STYLE");
  assert.equal(mod.prop, 1);
  assert.match(mod.first, /color: red/);
  assert.equal(mod.second.SHADOW_STYLE, mod.first);
});

test("transformOutput receives the raw css", async () => {
  const root = await fixture({
    "style.css": '.tick::before { content: "`"; }',
    "main.js": 'import "./style.css";\nexport const css = SHADOW_STYLE;\n'
  });
  const seen = [];
  const { chunk } = await bundle(root, {
    plugin: shadowStyle({
      transformOutput: css => (seen.push(css), css.replace("`", "!"))
    })
  });

  assert.equal(seen[0].trim(), '.tick::before { content: "`"; }');
  assert.match((await load(chunk.code)).css, /content: "!"/);
});

test("keeps sourcemaps aligned after the placeholder", async () => {
  const source =
    'import "./style.css";\nexport const css = SHADOW_STYLE, after = "MARKER";\n';
  const root = await fixture({
    "style.css": ".a { color: red; }\n".repeat(20),
    "main.js": source
  });
  const { chunk, output } = await bundle(root, { build: { sourcemap: true } });
  const mapAsset = output.find(file => file.fileName === "out.mjs.map");

  assert.doesNotMatch(chunk.code, /SHADOW_STYLE/);

  const lines = chunk.code.split("\n");
  const line = lines.findIndex(text => text.includes('"MARKER"'));
  const column = lines[line].indexOf('"MARKER"');
  const segments = decodeMappings(JSON.parse(mapAsset.source).mappings)[line];
  const segment = segments.find(([generated]) => generated === column);

  assert.ok(segment, `no mapping at generated column ${column}`);
  assert.deepEqual(segment.slice(2, 4), [
    1,
    source.split("\n")[1].indexOf('"MARKER"')
  ]);
  assert.deepEqual(
    decodeMappings(chunk.map.mappings),
    decodeMappings(JSON.parse(mapAsset.source).mappings)
  );
});

test("injects an empty string and warns when there is no css", async () => {
  const root = await fixture({
    "main.js": "export const css = SHADOW_STYLE;\n"
  });
  const { chunk, warnings } = await bundle(root);

  assert.equal((await load(chunk.code)).css, "");
  assert.ok(warnings.some(message => message.includes("No CSS found")));
});

test("fails on multiple css files", async () => {
  const root = await fixture({
    "a.css": ".a {}",
    "b.css": ".b {}",
    "main.js": 'import "./a.css";\nexport const css = SHADOW_STYLE;\n',
    "other.js": 'import "./b.css";\nexport const css = SHADOW_STYLE;\n'
  });

  await assert.rejects(
    bundle(root, {
      topLevel: false,
      build: {
        cssCodeSplit: true,
        lib: {
          entry: {
            main: join(root, "src/main.js"),
            other: join(root, "src/other.js")
          },
          fileName: (_, name) => `${name}.mjs`
        }
      }
    }),
    /Found 2 CSS files/
  );
});

test("iife wraps non-ES output", async () => {
  const root = await fixture({
    "style.css": ".a {}",
    "main.js": 'import "./style.css";\nexport const css = SHADOW_STYLE;\n'
  });
  const { chunk } = await bundle(root, {
    plugin: shadowStyle({ iife: true }),
    build: { sourcemap: true, lib: { formats: ["cjs"] } }
  });

  assert.match(chunk.code, /^\(\(\) => \{\n/);
  assert.match(
    chunk.code,
    /\n\}\)\(\);\n\/\/# sourceMappingURL=out\.js\.map\n?$/
  );
  assert.equal(chunk.map.mappings[0], ";");
});

test("iife refuses ES modules with exports", async () => {
  const root = await fixture({
    "style.css": ".a {}",
    "main.js": 'import "./style.css";\nexport const css = SHADOW_STYLE;\n'
  });

  await assert.rejects(
    bundle(root, { plugin: shadowStyle({ iife: true }) }),
    /Can't wrap "out.mjs" in an IIFE/
  );
});

test("forces cssCodeSplit off and rejects an explicit true", async () => {
  const plugin = shadowStyle();
  const env = { command: "build", mode: "production" };

  assert.deepEqual(plugin.config({}, env), { build: { cssCodeSplit: false } });
  assert.throws(() => plugin.config({ build: { cssCodeSplit: true } }, env));
});

function decodeMappings(mappings) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const state = [0, 0, 0, 0, 0];

  return mappings.split(";").map(line => {
    state[0] = 0;
    return line
      ? line.split(",").map(segment => {
          const values = [];
          let value = 0;
          let shift = 0;
          for (const char of segment) {
            const digit = chars.indexOf(char);
            value += (digit & 31) * 2 ** shift;
            if (digit & 32) shift += 5;
            else {
              values.push(value % 2 ? -Math.floor(value / 2) : value / 2);
              value = shift = 0;
            }
          }
          values.forEach((delta, index) => (state[index] += delta));
          return state.slice(0, values.length);
        })
      : [];
  });
}
