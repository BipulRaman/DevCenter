// ============ App — lightweight syntax highlighter ============
// Dependency-free and fully offline. Approximates VS Code's Dark+ / Light+
// token colors for the diff/code viewer so code reads exactly like the editor.
// Tokenizes one line at a time (diff-friendly). All output is HTML-escaped;
// tokens are wrapped in <span class="tok-*"> whose colors live in styles.css.

(function () {
  const esc = (s) =>
    s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

  // A rule is [tokenClass, regexSource]. Regexes must use ONLY non-capturing
  // groups (?:...) internally — the highlighter wraps each rule in a single
  // capturing group and identifies the matched rule by its group index.
  const r = (cls, re) => [cls, typeof re === "string" ? re : re.source];
  const kw = (cls, words) => [cls, "\\b(?:" + words.join("|") + ")\\b"];

  const G = {}; // language id -> ordered rule list

  G.js = [
    r("comment", /\/\/.*/),
    r("comment", /\/\*.*?\*\//),
    r("comment", /\/\*.*/),
    r("string", /"(?:\\.|[^"\\])*"?/),
    r("string", /'(?:\\.|[^'\\])*'?/),
    r("string", /`(?:\\.|[^`\\])*`?/),
    r("number", /\b0[xXbo][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/),
    kw("control", ["if","else","for","while","do","switch","case","break","continue","return","throw","try","catch","finally","await","yield"]),
    kw("keyword", ["var","let","const","function","class","extends","super","new","delete","typeof","instanceof","in","of","void","this","import","export","from","as","async","static","get","set","default","with","debugger","enum","interface","type","namespace","declare","readonly","public","private","protected","implements","abstract","keyof","infer","satisfies","override"]),
    kw("type", ["string","number","boolean","any","unknown","never","symbol","bigint","object"]),
    kw("constant", ["true","false","null","undefined","NaN","Infinity"]),
    r("function", /\b[A-Za-z_$][\w$]*(?=\s*\()/),
    r("property", /(?<=\.)[A-Za-z_$][\w$]*/),
    r("type", /\b[A-Z][\w$]*\b/),
    r("operator", /=>|[-+*\/%=&|<>!?:~^]+/),
    r("punct", /[{}()\[\];,.]/),
  ];

  G.rust = [
    r("comment", /\/\/.*/),
    r("comment", /\/\*.*?\*\//),
    r("comment", /\/\*.*/),
    r("string", /b?"(?:\\.|[^"\\])*"?/),
    r("type", /'[a-z_]\w*\b(?!')/),
    r("string", /'(?:\\.|[^'\\])'/),
    r("macro", /\b[a-z_]\w*!/),
    r("number", /\b0[xXbo][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?:[iuf](?:8|16|32|64|128|size))?\b/),
    kw("control", ["if","else","match","for","while","loop","break","continue","return"]),
    kw("keyword", ["let","mut","fn","struct","enum","impl","trait","pub","use","mod","crate","self","super","as","where","const","static","type","dyn","ref","move","box","async","await","unsafe","extern","in"]),
    kw("constant", ["true","false","None","Some","Ok","Err"]),
    kw("type", ["u8","u16","u32","u64","u128","usize","i8","i16","i32","i64","i128","isize","f32","f64","bool","char","str","String","Vec","Option","Result","Box","Rc","Arc","Self"]),
    r("function", /\b[a-z_]\w*(?=\s*\()/),
    r("property", /(?<=\.)[A-Za-z_]\w*/),
    r("type", /\b[A-Z]\w*\b/),
    r("operator", /=>|->|[-+*\/%=&|<>!?:~^]+/),
    r("punct", /::|[{}()\[\];,.]/),
  ];

  G.python = [
    r("comment", /#.*/),
    r("string", /[rbfRBF]{0,2}"""[\s\S]*?"""|[rbfRBF]{0,2}'''[\s\S]*?'''/),
    r("string", /[rbfRBF]{0,2}"(?:\\.|[^"\\])*"?/),
    r("string", /[rbfRBF]{0,2}'(?:\\.|[^'\\])*'?/),
    r("number", /\b0[xX][0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b/),
    kw("control", ["if","elif","else","for","while","try","except","finally","with","return","yield","raise","break","continue","pass","async","await"]),
    kw("keyword", ["def","class","import","from","as","lambda","global","nonlocal","del","assert","in","is","and","or","not"]),
    kw("constant", ["True","False","None","self","cls"]),
    r("function", /\b[A-Za-z_]\w*(?=\s*\()/),
    r("property", /(?<=\.)[A-Za-z_]\w*/),
    r("type", /\b[A-Z]\w*\b/),
    r("operator", /[-+*\/%=&|<>!~^@]+/),
    r("punct", /[{}()\[\];,.:]/),
  ];

  G.css = [
    r("comment", /\/\*.*?\*\//),
    r("comment", /\/\*.*/),
    r("string", /"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?/),
    r("meta", /@[\w-]+/),
    r("number", /#[0-9a-fA-F]{3,8}\b/),
    r("number", /\b-?\d*\.?\d+(?:px|em|rem|ex|ch|vw|vh|vmin|vmax|%|s|ms|deg|rad|fr|pt|pc|cm|mm|in)?\b/),
    r("keyword", /!important/),
    r("function", /\b[\w-]+(?=\()/),
    r("property", /[\w-]+(?=\s*:)/),
    r("punct", /[{}()\[\];:,]/),
  ];

  G.html = [
    r("comment", /<!--.*?-->/),
    r("comment", /<!--.*/),
    r("meta", /<!doctype[^>]*>/i),
    r("tag", /<\/?[a-zA-Z][\w:-]*/),
    r("tag", /\/?>/),
    r("attr", /[a-zA-Z_:][\w:-]*(?=\s*=)/),
    r("string", /"[^"]*"?|'[^']*'?/),
  ];

  G.json = [
    r("property", /"(?:\\.|[^"\\])*"(?=\s*:)/),
    r("string", /"(?:\\.|[^"\\])*"?/),
    r("number", /-?\b\d[\d.]*(?:[eE][+-]?\d+)?\b/),
    kw("constant", ["true","false","null"]),
    r("punct", /[{}\[\]:,]/),
  ];

  G.markdown = [
    r("comment", /<!--.*?-->/),
    r("heading", /^\s{0,3}#{1,6}\s.*/),
    r("type", /^\s*(?:```|~~~).*/),
    r("string", /`[^`]*`?/),
    r("bold", /\*\*[^*]+\*\*|__[^_]+__/),
    r("italic", /\*[^*\s][^*]*\*|_[^_\s][^_]*_/),
    r("link", /!?\[[^\]]*\]\([^)]*\)/),
    r("keyword", /^\s*>.*/),
    r("meta", /^\s*(?:[-*+]|\d+\.)\s/),
  ];

  G.yaml = [
    r("comment", /#.*/),
    r("property", /^\s*-?\s*[\w.-]+(?=\s*:)/),
    r("string", /"(?:\\.|[^"\\])*"?|'[^']*'?/),
    kw("constant", ["true","false","null","yes","no","on","off","True","False","Null","None"]),
    r("number", /\b-?\d[\d.]*\b/),
    r("meta", /^\s*-\s/),
    r("punct", /[:,{}\[\]]/),
  ];

  G.toml = [
    r("comment", /#.*/),
    r("type", /^\s*\[\[?[^\]]+\]\]?/),
    r("property", /^\s*[\w.-]+(?=\s*=)/),
    r("string", /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"?|'[^']*'?/),
    kw("constant", ["true","false"]),
    r("number", /\b\d[\d.:T+\-]*\b/),
    r("operator", /=/),
  ];

  G.shell = [
    r("comment", /#.*/),
    r("string", /"(?:\\.|[^"\\])*"?|'[^']*'?/),
    r("variable", /\$\{[^}]*\}?|\$\w+/),
    kw("control", ["if","then","else","elif","fi","for","while","until","do","done","case","esac","in","select","function","return","break","continue"]),
    kw("keyword", ["echo","cd","export","local","source","set","unset","read","exit","sudo","alias","eval","trap","printf","test"]),
    r("function", /^\s*[\w-]+(?=\s*\(\s*\))/),
    r("operator", /[|&;<>]+/),
  ];

  G.powershell = [
    r("comment", /<#[\s\S]*?#>/),
    r("comment", /#.*/),
    r("string", /@?"(?:`.|[^"`])*"?|@?'[^']*'?/),
    r("variable", /\$[\w:]+/),
    r("control", /\b(?:if|elseif|else|switch|foreach|for|while|do|until|return|break|continue|try|catch|finally|throw)\b/i),
    r("keyword", /\b(?:function|param|begin|process|end|filter|class|enum|in|using|module)\b/i),
    r("function", /\b[A-Z][a-z]+-[A-Z][A-Za-z]+\b/),
    r("operator", /-(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|replace|split|join|and|or|not|is|isnot|band|bor)\b/i),
    r("number", /\b\d+(?:\.\d+)?\b/),
  ];

  G.sql = [
    r("comment", /--.*/),
    r("comment", /\/\*.*?\*\//),
    r("string", /'(?:''|[^'])*'?/),
    r("control", /\b(?:select|from|where|join|left|right|inner|outer|full|cross|on|group|by|order|having|union|all|insert|into|values|update|set|delete|create|alter|drop|truncate|table|index|view|database|schema)\b/i),
    r("keyword", /\b(?:and|or|not|null|as|distinct|case|when|then|else|end|limit|offset|asc|desc|primary|key|foreign|references|default|unique|check|constraint|with|exists|between|like|in|is|count|sum|avg|min|max|int|integer|bigint|varchar|char|text|date|datetime|timestamp|boolean|decimal|numeric|float|double)\b/i),
    r("number", /\b\d+(?:\.\d+)?\b/),
    r("punct", /[(),;.*]/),
  ];

  G.clike = [
    r("meta", /^\s*#\s*\w+/),
    r("comment", /\/\/.*/),
    r("comment", /\/\*.*?\*\//),
    r("comment", /\/\*.*/),
    r("string", /"(?:\\.|[^"\\])*"?/),
    r("string", /'(?:\\.|[^'\\])*'?/),
    r("string", /`[^`]*`?/),
    r("number", /\b0[xXbo][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*\b/),
    kw("control", ["if","else","for","while","do","switch","case","default","break","continue","return","goto","try","catch","finally","throw","throws","yield","defer","select"]),
    kw("keyword", ["int","long","short","char","void","float","double","bool","boolean","byte","unsigned","signed","const","constexpr","static","struct","class","public","private","protected","new","delete","this","namespace","using","template","typename","virtual","override","final","enum","union","typedef","sizeof","package","import","extends","implements","interface","abstract","synchronized","volatile","transient","native","func","var","val","fun","type","map","chan","range","go","auto","inline","operator","friend","explicit","mutable","nullptr","string"]),
    kw("constant", ["true","false","null","nil","NULL","None"]),
    r("function", /\b[A-Za-z_]\w*(?=\s*\()/),
    r("property", /(?<=\.)[A-Za-z_]\w*/),
    r("type", /\b[A-Z]\w*\b/),
    r("operator", /=>|->|::|[-+*\/%=&|<>!?:~^]+/),
    r("punct", /[{}()\[\];,.]/),
  ];

  const EXT = {
    js:"js", jsx:"js", mjs:"js", cjs:"js", es6:"js", ts:"js", tsx:"js", mts:"js", cts:"js",
    rs:"rust",
    py:"python", pyw:"python", pyi:"python",
    json:"json", jsonc:"json", json5:"json", geojson:"json",
    css:"css", scss:"css", sass:"css", less:"css",
    html:"html", htm:"html", xml:"html", xhtml:"html", svg:"html", vue:"html", svelte:"html",
    md:"markdown", markdown:"markdown", mdx:"markdown",
    yml:"yaml", yaml:"yaml",
    toml:"toml",
    sh:"shell", bash:"shell", zsh:"shell", ksh:"shell",
    ps1:"powershell", psm1:"powershell", psd1:"powershell",
    sql:"sql",
    c:"clike", h:"clike", cpp:"clike", cc:"clike", cxx:"clike", hpp:"clike", hh:"clike", hxx:"clike", ino:"clike",
    cs:"clike", java:"clike", go:"clike", kt:"clike", kts:"clike", swift:"clike",
    scala:"clike", dart:"clike", php:"clike", rb:"clike", groovy:"clike", gradle:"clike", proto:"clike",
  };

  const compiled = {};
  function grammar(lang) {
    if (!lang || !G[lang]) return null;
    if (!compiled[lang]) {
      const rules = G[lang];
      const re = new RegExp(rules.map((x) => "(" + x[1] + ")").join("|"), "g");
      compiled[lang] = { re, classes: rules.map((x) => x[0]) };
    }
    return compiled[lang];
  }

  function highlight(code, g) {
    if (!g) return esc(code);
    const re = g.re;
    const classes = g.classes;
    re.lastIndex = 0;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(code))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > last) out += esc(code.slice(last, m.index));
      let gi = -1;
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) { gi = i; break; }
      }
      const cls = gi > 0 ? classes[gi - 1] : null;
      out += cls ? '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>" : esc(m[0]);
      last = re.lastIndex;
    }
    if (last < code.length) out += esc(code.slice(last));
    return out;
  }

  window.Highlighter = {
    // Map a file path to a language id (or "" for plaintext / unknown).
    langForPath(path) {
      const base = (String(path || "").split(/[\\/]/).pop() || "").toLowerCase();
      if (base === "dockerfile" || base.startsWith("dockerfile.")) return "shell";
      if (base === "makefile" || base === "gnumakefile") return "shell";
      if (base === "cargo.lock") return "toml";
      const ext = base.includes(".") ? base.split(".").pop() : "";
      return EXT[ext] || "";
    },
    // Highlight a single line; returns HTML-escaped, span-wrapped markup.
    line(code, lang) {
      return highlight(code == null ? "" : String(code), grammar(lang));
    },
  };
})();
