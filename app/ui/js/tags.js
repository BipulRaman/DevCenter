// ---------- Repo tags: filter bar + editor ----------
let tagFilterSig = ""; // signature of the last-rendered tag menu (rebuild guard)
function renderTagFilter() {
  const select = document.getElementById("repoTagSelect");
  const menu = document.getElementById("repoTagMenu");
  const label = document.getElementById("repoTagLabel");
  if (!select || !menu) return;
  // Aggregate tags across all repos with counts.
  const counts = new Map();
  repos.forEach((r) => (r.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  if (!counts.size) {
    select.hidden = true;
    repoTagFilter.clear();
    tagFilterSig = "";
    return;
  }
  select.hidden = false;
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  // Drop any selected tags that no longer exist.
  repoTagFilter = new Set([...repoTagFilter].filter((t) => counts.has(t)));

  // Skip the DOM rebuild when nothing affecting the menu changed (e.g. search
  // keystrokes). Leaves the menu DOM — and its listeners — intact (WebView2-safe).
  const sig = tags.map((t) => `${t}:${counts.get(t)}`).join("|") + "#" + [...repoTagFilter].sort().join(",");
  if (sig === tagFilterSig) return;
  tagFilterSig = sig;

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="repoTagAll" ${repoTagFilter.size === 0 ? "checked" : ""} />
       <span>All tags</span>
     </label>
     <div class="multiselect-sep"></div>` +
    tags
      .map(
        (t) => `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(t)}" ${repoTagFilter.has(t) ? "checked" : ""} />
          <span>${escapeHtml(t)}</span>
          <span class="multiselect-count">${counts.get(t)}</span>
        </label>`
      )
      .join("");

  // Button label reflects the selection.
  if (repoTagFilter.size === 0) label.textContent = "All tags";
  else if (repoTagFilter.size === 1) label.textContent = [...repoTagFilter][0];
  else label.textContent = `${repoTagFilter.size} tags`;

  const allBox = document.getElementById("repoTagAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      repoTagFilter.clear();
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) repoTagFilter.add(box.value);
    else repoTagFilter.delete(box.value);
    renderRepos(document.getElementById("repoSearch").value || "");
  });
}

function openTagEditor(repo) {
  let tags = [...(repo.tags || [])];
  const suggestions = [...new Set(repos.flatMap((r) => r.tags || []))].sort();
  Modal.custom({
    title: `Tags · ${repo.name}`,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="tag-edit-list" id="tagList"></div>
        <input class="modal-input" id="tagInput" placeholder="Add a tag and press Enter" spellcheck="false" autocomplete="off" maxlength="24" />
        <div class="tag-suggest" id="tagSuggest"></div>
        <div class="modal-error" id="tagErr"></div>`;
      const listEl = body.querySelector("#tagList");
      const input = body.querySelector("#tagInput");
      const suggestEl = body.querySelector("#tagSuggest");

      const drawList = () => {
        listEl.innerHTML = tags.length
          ? tags.map((t, i) => `<span class="tag-edit">${escapeHtml(t)}<button data-rm="${i}" title="Remove">${ICON.x}</button></span>`).join("")
          : `<span style="color:var(--text-faint);font-size:12.5px">No tags yet.</span>`;
        on(listEl, "[data-rm]", "click", (b) => {
          tags.splice(Number(b.dataset.rm), 1);
          drawList();
          drawSuggest();
        });
      };
      const addTag = (raw) => {
        const t = raw.trim();
        if (!t) return;
        if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
        input.value = "";
        drawList();
        drawSuggest();
      };
      const drawSuggest = () => {
        const avail = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));
        suggestEl.innerHTML = avail.length
          ? `<span class="tag-suggest-label">Existing tags</span>` + avail.map((s) => `<button data-add="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")
          : "";
        on(suggestEl, "[data-add]", "click", (b) => addTag(b.dataset.add));
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addTag(input.value);
        } else if (e.key === "Backspace" && !input.value && tags.length) {
          tags.pop();
          drawList();
          drawSuggest();
        }
      });
      drawList();
      drawSuggest();
      setTimeout(() => input.focus(), 40);

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Save");
      save.addEventListener("click", async () => {
        if (input.value.trim()) addTag(input.value);
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          if (DC && DC.hasBackend) {
            const updated = await DC.setRepoTags(repo.id, tags);
            const at = repos.findIndex((x) => x.id === updated.id);
            if (at >= 0) repos[at] = updated;
          } else {
            repo.tags = tags;
          }
          close(true);
          renderRepos(document.getElementById("repoSearch").value || "");
        } catch (e) {
          console.error("setRepoTags failed", e);
          body.querySelector("#tagErr").textContent = String(e);
          save.disabled = false;
          save.textContent = "Save";
        }
      });
      foot.append(cancel, save);
    },
  });
}
