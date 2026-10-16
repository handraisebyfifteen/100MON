# exhibition-2026-10-hell（書いた問題の検証）

- 入力: `pipeline/written/exhibition-2026-10-hell.json`（128 問）
- 合格: 104 問 → `data/questions.exhibition-2026-10-hell.json`
- 実行: 2026-10-16T10:23:46+00:00

## 不合格（直して流し直す）

- 004 **融点が一番高い金属** → タングステン　/ The metal with the highest melting point → Tungsten
  - [形式] 正解「タングステン」は使用済みの題材
- 005 **密度が一番大きい元素** → オスミウム　/ The element with the highest density → Osmium
  - [verifier1] answer_correct: オスミウムとイリジウムは密度が非常に近く、どちらが最大かは測定方法や条件によって変わり得るため、厳密に「正解」と言いきれない。
  - [verifier1] single_answer: オスミウムとイリジウムの密度はほぼ同等であり、どちらが最大かは確定的ではないため、正解が2つ存在し得る。
- 006 **電気を一番よく通す金属** → 銀　/ The metal with the highest electrical conductivity → Silver
  - [形式] 正解「銀」は使用済みの題材
- 014 **太陽系で表面の温度が一番高い惑星** → 金星　/ The planet with the hottest surface in the Solar System → Venus
  - [形式] 正解「金星」は使用済みの題材
- 020 **太陽系で濃い大気を持つ唯一の衛星** → タイタン　/ The only moon in the Solar System with a dense atmosphere → Titan
  - [形式] 正解「タイタン」は使用済みの題材
- 024 **100以下の素数はいくつ？** → 25個　/ The number of prime numbers up to 100 → 25
  - [verifier2] answer_correct: 100以下の素数は25個ではなく24個である
  - [verifier2] single_answer: 正解が25個ではないため、正解が存在しない
- 025 **凸多面体で「頂点−辺＋面」はいくつ？** → 2　/ For any convex polyhedron, vertices minus edges plus faces → 2
  - [形式] 正解「2」は使用済みの題材
- 027 **1から100までの整数をすべて足した数** → 5050　/ The sum of all integers from 1 to 100 → 5050
  - [形式] 正解「5050」は使用済みの題材
  - [形式] 同じ問題文（言い回し違いを含む）が使用済み
- 040 **徳川慶喜が大政奉還を表明した城** → 二条城　/ The castle where Tokugawa Yoshinobu announced the return of power to the emperor → Nijō Castle
  - [verifier2] answer_correct: 大政奉還は京都の二条城で表明されたが、実際の奏上は朝廷に参内して行い、城内の特定の場所での宣言という記録が明確でないため、表現が正確でない可能性がある
- 054 **世界で2番目に大きい島** → ニューギニア島　/ The second-largest island in the world → New Guinea
  - [verifier2] answer_correct: 世界で2番目に大きい島はボルネオ島ではなく、マダガスカル島が3番目、ニューギニア島が2番目という情報があるが、実際にはボルネオ島が3番目で、正解はマダガスカル島ではない。正しくはニューギニア島が2番目で、最大はグリーンランド。
  - [verifier2] single_answer: 正解がニューギニア島とされるが、面積の定義（本土との扱いなど）によって順位が変わることがあり、一意に定まらない。
- 060 **日本で流域面積が一番広い川** → 利根川　/ The river with the largest drainage basin in Japan → Tone River
  - [verifier2] answer_correct: 流域面積が一番広い川は利根川ではなく信濃川である
  - [verifier2] single_answer: 正解が利根川とされており、事実と異なる
- 062 **『デカメロン』の作者** → ボッカッチョ　/ The author of 'The Decameron' → Giovanni Boccaccio
  - [形式] 正解「ボッカッチョ」は使用済みの題材
  - [形式] 同じ問題文（言い回し違いを含む）が使用済み
- 063 **『百年の孤独』の作者** → ガルシア＝マルケス　/ The author of 'One Hundred Years of Solitude' → Gabriel García Márquez
  - [形式] 正解「ガルシア＝マルケス」は使用済みの題材
  - [形式] 同じ問題文（言い回し違いを含む）が使用済み
- 071 **現在の標準のピッチで、A（ラ）の音の周波数** → 440Hz　/ The frequency of the note A in today's standard concert pitch → 440 Hz
  - [verifier1] not_time_sensitive: 標準のピッチ（Aの音の周波数）は歴史的に変遷があり、今後も変更される可能性があるため、時期によって答えが変わる可能性がある。
- 078 **「見返り美人図」を描いた絵師** → 菱川師宣　/ The ukiyo-e artist who painted 'Beauty Looking Back' → Hishikawa Moronobu
  - [verifier1] answer_correct: 「見返り美人図」の作者は菱川師宣ではなく、彼の弟子または後世の模倣者とされることが多いが、一般的には「伝 菱川師宣」として広く知られている。しかし、厳密には作者が特定されておらず、菱川師宣を確実に正解とするのは難しい。
  - [verifier1] single_answer: 「見返り美人図」の作者は諸説あり、確定的な正解が存在しないため、他の選択肢も完全に不正解とは言えない。
  - [verifier1] locale_match: 日本語版の選択肢「菱川師宣」と英語版の「Hishikawa Moronobu」は一致しているが、作者の特定が曖昧であるため、問題の意味と正解が一致しているとは言えない。
  - [verifier2] answer_correct: 「見返り美人図」は菱川師宣ではなく、一般的には鈴木春信やその周辺の作品とされるため、正解ではない
  - [verifier2] single_answer: 正解が複数存在する可能性があり、作品の帰属が明確でない
  - [verifier2] locale_match: 日本語の『見返り美人図』と英語の『Beauty Looking Back』が同じ作品とされるが、作者の帰属が言語間で一致していない
- 086 **キリンの首の骨の数** → 7個　/ The number of neck vertebrae in a giraffe → 7
  - [形式] 正解「7個」は使用済みの題材
  - [形式] 同じ問題文（言い回し違いを含む）が使用済み
- 091 **イチゴの表面のつぶつぶの正体** → 果実　/ What the tiny specks on the surface of a strawberry really are → Fruits
  - [verifier2] 検証エラー: ValueError: 項目 'single_answer' の判定が欠落または不正
- 102 **マラソンが42.195kmになったもとの五輪の開催地** → ロンドン　/ The Olympic host city whose marathon set the 42.195 km distance → London
  - [verifier1] answer_correct: 1908年のロンドン五輪でマラソンの距離が42.195kmと初めて設定されたが、これは公式に標準距離として採用されたものではない。公式に42.195kmが標準距離として採用されたのは1921年のIAAF（国際陸上競技連盟）によるもので、その時点での五輪開催地は Antwerp（アントワープ）となる。
  - [verifier1] single_answer: 問題の表現が不明確なため、正解が複数の解釈を許す可能性がある。例えば、初めて42.195kmが採用された五輪（ロンドン）と、公式に標準化されたタイミングの五輪開催地（アントワープ）が混同される恐れがある。
  - [verifier1] unambiguous: 「マラソンが42.195kmになったもとの五輪の開催地」という表現は、複数の解釈を許す可能性がある。具体的には、初めて42.195kmが採用された五輪なのか、それとも単にその距離が採用された五輪の一つなのかが不明確。
- 112 **宝石の1カラットは何グラム？** → 0.2グラム　/ The mass in grams of one carat, the unit used for gemstones → 0.2 grams
  - [verifier2] answer_correct: 1カラットは0.2グラムではなく、正確には0.2グラム（200ミリグラム）と定義されており、選択肢の「0.2グラム」は正しいが、問題文が単純すぎて正解が即座にわかる可能性があるが、事実誤認はない。ただし、正解は3番目（0.2グラム）で設定されており、これは正しい。ただし、判定対象は事実正確性で、0.2グラムは正しいので、再評価の必要あり。→ 正しくは『0.2グラム』なので、answer_correctは合格。誤判定撤回。
- 113 **水の三重点の温度** → 0.01℃　/ The temperature of the triple point of water → 0.01 °C
  - [verifier2] answer_correct: 水の三重点の温度は正確に0.01℃ではなく、273.16K（=0.01℃）と定義されているが、これは摂氏0.01度というよりも熱力学温度の定義に基づくものであり、正確には0℃よりわずかに高いが、単に「0.01℃」とだけ書くのは厳密に正確とは言えないため不合格
  - [verifier2] single_answer: 選択肢に「0.01℃」があるが、三重点は正確には「0.01℃」ではなく熱力学温度273.16Kとして定義されており、他の選択肢も含め厳密な意味で正しい表現がない可能性があるため、正解が一つに定まらない
- 121 **ユニオンジャックに旗が入っていない地域** → ウェールズ　/ The part of the British Isles whose flag is not included in the Union Jack → Wales
  - [verifier1] answer_correct: ユニオンジャックに含まれないのは「ウェールズ」の旗だが、「アイルランド」の旗も完全には含まれていない（北アイルランドはアイルランド全体を代表しない）。
  - [verifier1] single_answer: 「ウェールズ」が正解だが、「アイルランド」も曖昧な意味で不正解とは言い切れない。
  - [verifier1] unambiguous: 「アイルランド」は国全体を指すのか、それとも北アイルランドを指すのか曖昧。
  - [verifier1] locale_match: 英語版の「Ireland」と日本語版の「アイルランド」の解釈が一致しているか曖昧。
  - [verifier2] answer_correct: ユニオンジャックにはイングランド、スコットランド、アイルランドの要素は含まれているが、ウェールズの旗は含まれていないため、正解は『ウェールズ』でない限り不正解
  - [verifier2] single_answer: スコットランドとイングランドも歴史的経緯で解釈が分かれる可能性がある
  - [verifier2] unambiguous: ウェールズが含まれていないという事実について、一般的な認識と異なる解釈の余地がある
  - [verifier2] locale_match: 日本語の『ユニオンジャックに旗が入っていない地域』と英語の『flag is not included in the Union Jack』の解釈が一致していない可能性がある
  - [verifier2] not_trick: 『ユニオンジャックに含まれていない』という表現が曖昧で、歴史的経緯や定義によって解釈が分かれる
- 123 **88鍵のピアノで一番低い音** → ラ　/ The lowest note on an 88-key piano → A
  - [verifier1] answer_correct: 88鍵のピアノで一番低い音は「ラ (A)」ではなく「ド (C)」のさらに3オクターブ下の「ラ♭ (A0)」または「ラ (A1)」だが、選択肢に「ラ (A)」が正解とされているのは不正確。正確には「A0」または「ラ♭」だが、選択肢に含まれないため、この問題設定自体が誤り。
  - [verifier1] single_answer: 問題文と回答設定が不正確なため、どの選択肢も確実に正解とは言えない。
  - [verifier1] unambiguous: 「88鍵のピアノで一番低い音」は「ラ」だが、問題文が「どの音名か」を明確に問うていないため、解釈によっては「音の高さ（周波数）や鍵盤の位置」を問うていると誤解される可能性がある。
  - [verifier1] locale_match: 日本語版と英語版で正解の選択肢が一致していない（正解とされる「ラ (A)」は実際には不正確であり、問題の意図が日英で異なる可能性がある）。
- 124 **舌で感じる5つの基本の味に入らないもの** → 辛味　/ The one that is not among the five basic tastes → Spicy heat
  - [verifier2] locale_match: 英語版の選択肢 'Spicy heat' は味覚ではなく感覚のため、日本語の『辛味』と完全に一致しない
- 127 **「ありがとう」のもとになった言葉** → 古語の「有り難し」　/ Where the Japanese word 'arigatō' comes from → Old Japanese 'arigatashi'
  - [verifier2] unambiguous: 「もとになった言葉」とは語源か、それとも感謝の念の由来か解釈が分かれる可能性がある
  - [verifier2] not_trick: 語源についての知識を問うているが、歴史的経緯や借用語か否かで紛らわしい

## 費用

| モデル | 呼び出し | トークン in/out | 概算 |
| :-- | --: | :-- | --: |
| `mistral.mistral-large-3-675b-instruct` | 54 | 55628/6834 | 単価未確認 |
| `qwen.qwen3-235b-a22b-2507-v1:0` | 27 | 39109/4375 | $0.0125 |
