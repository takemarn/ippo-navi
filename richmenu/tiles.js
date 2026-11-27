/* リッチメニューの6タイル（3列×2段）の中身。画面の入口(#menu)と richmenu.png の両方がこれを使う。
   アイコンは自作の単純な線画（64×64）。並び: 上段 1〜3、下段 4〜6 */
(function (root) {
  var TILES = [
    { no: 1, hash: 'apply', label: '経費勤怠申請', en: 'EXPENSE & ATTENDANCE', color: '#b07d1e', tint: '#fbf1dc', badge: '#b8892b',
      icon: '<rect class="f" x="12" y="7" width="28" height="42" rx="3"/>' +
        '<path d="M12 10a3 3 0 013-3h22a3 3 0 013 3v38l-4.7-3-4.6 3-4.7-3-4.7 3-4.6-3-4.7 3z"/>' +
        '<path d="M20 15l6 7 6-7M26 22v10M21 24h10M21 28h10M19 39h14"/>' +
        '<circle class="w" cx="45" cy="42" r="12"/><path d="M45 35v7l5 3"/>' },
    { no: 2, hash: 'status', label: '申請状況', en: 'APPLICATION STATUS', color: '#2a62c9', tint: '#e3eefd', badge: '#2f6fd6',
      icon: '<rect class="f" x="11" y="7" width="32" height="44" rx="4"/>' +
        '<rect x="11" y="7" width="32" height="44" rx="4"/>' +
        '<path d="M17 17l2.5 2.5 4.5-4.5M28 17h9M17 27l2.5 2.5 4.5-4.5M28 27h9M28 37h9"/><circle cx="20.5" cy="37" r="2.6"/>' +
        '<circle class="w" cx="46" cy="44" r="11"/><path d="M41.5 38.5h9M41.5 49.5h9M43 38.5c0 4 6 5 6 11M49 38.5c0 4-6 5-6 11"/>' },
    { no: 3, hash: 'task', label: 'タスク管理', en: 'TASK MANAGEMENT', color: '#23885a', tint: '#e2f4ea', badge: '#2e9a5a',
      icon: '<rect class="f" x="10" y="11" width="34" height="42" rx="4"/>' +
        '<rect x="10" y="11" width="34" height="42" rx="4"/><rect class="w" x="19" y="7" width="16" height="8" rx="2.5"/>' +
        '<rect x="16" y="22" width="7" height="7" rx="1.5"/><path d="M17.5 25.5l1.8 1.8 3.4-3.6M28 25.5h10"/>' +
        '<rect x="16" y="35" width="7" height="7" rx="1.5"/><path d="M28 38.5h10"/>' +
        '<path class="w" d="M41 53l1-6 13-13 5 5-13 13zM51 38l5 5"/>' },
    { no: 4, hash: 'users', label: '利用者一覧', en: 'USER LIST', color: '#6a43c2', tint: '#eee6fb', badge: '#7b4fd0',
      icon: '<circle class="f" cx="20" cy="19" r="7"/><circle cx="20" cy="19" r="7"/>' +
        '<path d="M7 44c0-8.5 5.8-13.5 13-13.5S33 35.5 33 44z" class="f"/><path d="M7 44c0-8.5 5.8-13.5 13-13.5S33 35.5 33 44"/>' +
        '<rect class="w" x="34" y="20" width="23" height="30" rx="3.5"/>' +
        '<circle cx="41" cy="28" r="2.4"/><path d="M46 28h6M39 36h13M39 42h9"/>' },
    { no: 5, hash: 'shift', label: 'シフト管理', en: 'SHIFT MANAGEMENT', color: '#d2601e', tint: '#fdebdf', badge: '#e2702a',
      icon: '<rect class="f" x="7" y="12" width="38" height="36" rx="4"/>' +
        '<rect x="7" y="12" width="38" height="36" rx="4"/><path d="M7 21h38M16 8v8M36 8v8"/>' +
        '<path d="M14 28h4M23 28h4M32 28h4M14 35h4M23 35h4M14 42h4"/>' +
        '<circle class="w" cx="45" cy="43" r="12"/><path d="M45 36v7l5 3"/>' },
    { no: 6, hash: 'portal', label: '相談AI', en: 'AI CONSULTATION', color: '#158a86', tint: '#dff3f2', badge: '#1e9e9a',
      icon: '<path class="f" d="M12 12h32a5 5 0 015 5v20a5 5 0 01-5 5H28l-9 8v-8h-7a5 5 0 01-5-5V17a5 5 0 015-5z"/>' +
        '<path d="M12 12h32a5 5 0 015 5v20a5 5 0 01-5 5H28l-9 8v-8h-7a5 5 0 01-5-5V17a5 5 0 015-5z"/>' +
        '<path d="M17 34l5.5-14 5.5 14M19 29.5h7M35 20v14M32 20h6M32 34h6"/>' +
        '<path d="M54 6v8M50 10h8M57 22v4M55 24h4"/>' }
  ];
  if (typeof module === 'object' && module.exports) module.exports = TILES; else root.IPPO_TILES = TILES;
})(this);
