exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { image, mediaType, filename } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

    const today = new Date();
    const prompt = `これはバー・居酒屋「ハレル」の手書き伝票の画像です。
以下のルールに従ってデータを読み取り、JSONのみで返してください（説明文・マークダウン不要）。

【読み取りルール】
1. 顧客名から敬称（さん・くん等）を除く
2. 人数は伝票に書かれた数字をそのまま読む
3. 炭酸・ソーダがある場合は「あり」、なければ空欄
4. ボトル名は商品名欄の最後のアイテム（Sはセットを意味するのでボトル名ではない）
5. 二重横線で消された数字は無効、上下の消されていない数字を使用
6. 伝票に複数の名前がある場合のみ名前の数で行を分割
7. 分割時：人数=合計人数÷分割数(切捨て)、合計=合計÷分割数(切捨て)
8. 同行者=顧客名以外の人（顧客本人は含めない）
9. 日付は伝票に書かれた日付を読む。年は${today.getFullYear()}年か${today.getFullYear()-1}年で判断
10. ボトル名の正規化：黒きり→黒霧島

顧客名の正規化：えっちん→えっとん、しょーへいさん→しょーへー、ごとーさん→後藤、こーじさん→こーじ、大竹→大坪、和やん→柳、谷→谷やん

既知のボトルブランド：AO、ヴーヴ、アルマンド、だいやめ、モエ・エ・シャンドン、角、吉四六、黒霧島、山崎、山崎12年、神の河、知多、二階堂、まる、ドンペリ、白州

出力形式（JSONのみ、マークダウン不要）：
[{"日付":"YYYY-MM-DD","曜日":"月","顧客名":"えっとん","人数":2,"合計":15000,"ボトル":"黒霧島","炭酸":"あり","その他":"","同行者":"","精度":4,"理由":""}]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mediaType, data: image } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Gemini API error: ' + err);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // マークダウンのコードブロックを除去してJSONを抽出
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSONが見つかりません: ' + text.slice(0, 300));
    const rows = JSON.parse(match[0]);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, rows, filename })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
