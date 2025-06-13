// backend/src/server.ts

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import cors from 'cors';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: "http://localhost:3003", // フロントエンドのポートに合わせる
  methods: ["GET", "POST"]
}));

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "http://localhost:3003", // Socket.IOのCORS設定 (WebSocket通信用)
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createSupabaseClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// データベース接続関数（Supabase SDKで接続確認）
async function connectToDatabase() {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("環境変数が設定されていません: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    }
    const { data, error } = await supabase.from('messages').select('id').limit(1);
    if (error) {
        console.error('Supabase疎通確認エラー:', error);
        throw new Error('Supabase疎通確認に失敗しました。');
    }
    console.log('Supabase (PostgreSQL) に接続しました！');
  } catch (error) {
    console.error('Supabase接続エラー:', error);
    process.exit(1);
  }
}

// Express APIエンドポイント
app.get('/', (req, res) => {
  res.send('Anonymous Chat Backend is running with Supabase!');
});

app.get('/api/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data.map(msg => ({
      id: msg.id,
      roomId: msg.room_id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      timestamp: msg.created_at,
      // ★追加: リプライ情報もマッピング（DBのカラム名と合わせる）
      replyToMessageId: msg.reply_to_message_id,
      replyToMessageContent: msg.reply_to_message_content,
      replyToUsername: msg.reply_to_username
    })));
  } catch (error) {
    console.error('メッセージ履歴取得エラー (Supabase):', error);
    res.status(500).json({ error: 'メッセージの取得に失敗しました。' });
  }
});

// Socket.IO接続イベント
io.on('connection', (socket) => {
  console.log('--- Socket.IO: 新しいユーザーが接続しました --- ID:', socket.id);

  socket.on('join_room', async (roomId: string) => {
    socket.join(roomId);
    console.log(`--- Socket.IO: ユーザー ${socket.id} がルーム ${roomId} に参加しました。`);
  });

  // ★★★ send_message イベントのdataの型定義を修正 ★★★
  socket.on('send_message', async (data: { 
      roomId: string; 
      userId: string; 
      username: string; 
      message: string;
      // ★これらのプロパティを追加しました！
      replyToMessageId?: string;
      replyToMessageContent?: string;
      replyToUsername?: string;
    }) => { // <= ここが修正されました
    console.log(`--- Socket.IO: 「send_message」イベントを受信しました ---`);
    console.log(`   ルーム: ${data.roomId}, ユーザー: ${data.username} (${data.userId}), メッセージ: ${data.message}`);
    // ★デバッグ用: 受信したdataオブジェクト全体をログに出力
    console.log('--- Socket.IO: 受信したdataオブジェクト全体 ---', data);


    const messageToSave = {
      room_id: data.roomId, // DBのカラム名に合わせる
      user_id: data.userId,
      username: data.username,
      message: data.message,
      // ★以下3行を、dataから取得してDBのカラム名に合わせます★
      // undefined の場合は null を保存するように || null を付ける
      reply_to_message_id: data.replyToMessageId || null,
      reply_to_message_content: data.replyToMessageContent || null,
      reply_to_username: data.replyToUsername || null
    };

    try {
      const { data: insertedData, error } = await supabase
        .from('messages') // テーブル名に合わせる
        .insert([messageToSave])
        .select('*'); // 挿入されたデータを取得

      if (error) {
          console.error('--- Supabase: メッセージ保存エラー ---:', error);
          // エラーの詳細を表示
          console.error('   挿入データ:', messageToSave);
          console.error('   Supabaseエラーコード:', error.code);
          console.error('   Supabaseエラーメッセージ:', error.message);
          throw error;
      }

      if (!insertedData || insertedData.length === 0) {
          console.warn('--- Supabase: メッセージが挿入されましたが、返されたデータが空です。');
          return; // データが返ってこなければブロードキャストしない
      }

      // ★Socket.IOで送信するメッセージオブジェクトにリプライ情報を含める（DBのカラム名からマッピング）
      const sentMessage = { // Message インターフェースと一致するように
        id: insertedData[0].id,
        roomId: insertedData[0].room_id,
        userId: insertedData[0].user_id,
        username: insertedData[0].username,
        message: insertedData[0].message,
        timestamp: insertedData[0].created_at,
        // これらが正確にマッピングされているか？
        replyToMessageId: insertedData[0].reply_to_message_id,
        replyToMessageContent: insertedData[0].reply_to_message_content,
        replyToUsername: insertedData[0].reply_to_username
      };

      io.to(data.roomId).emit('receive_message', sentMessage);
      console.log('--- Socket.IO: メッセージをSupabaseに保存し、ルームにブロードキャストしました。');
      console.log('--- Socket.IO: ブロードキャストされたメッセージ ---', sentMessage); // ★ログ追加
    } catch (error) {
      console.error('--- Socket.IO: メッセージ処理中に致命的なエラーが発生しました ---:', error);
      // エラーをクライアントに通知するなどの追加処理も検討可能
    }
  });

  socket.on('disconnect', () => {
    console.log('--- Socket.IO: ユーザーが切断しました --- ID:', socket.id);
  });

  socket.on('error', (err) => {
    console.error('--- Socket.IO: ソケットエラー ---:', err);
  });
});

// サーバー起動
connectToDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
  });
});