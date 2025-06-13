// frontend/src/ChatRoom.tsx

import React, { useState, useEffect, useRef } from 'react';
import socket from './socket'; // Socket.IOクライアントをインポート
import { v4 as uuidv4 } from 'uuid'; // ユニークなID生成

interface Message {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  replyToMessageId?: string; // どのメッセージへのリプライか
  replyToMessageContent?: string; // リプライ元のメッセージ内容 (表示用)
  replyToUsername?: string; // リプライ元のユーザー名 (表示用)
} 

const BACKEND_API_URL = 'http://localhost:3000'; // バックエンドAPIのURL

const ChatRoom: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState(`匿名-${Math.floor(Math.random() * 10000)}`);
  const [userId, setUserId] = useState<string>(uuidv4()); // Web版ではユーザーIDをセッションごとに生成
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [joined, setJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: string; content: string; username: string } | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null); // textareaに変更されたので型も変更

  // 各メッセージの参照を保持するためのRefオブジェクト
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 特定のメッセージへスクロールする関数
  const scrollToMessage = (messageId: string) => {
    const targetMessageRef = messageRefs.current[messageId];
    if (targetMessageRef) {
      targetMessageRef.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      console.warn(`メッセージID ${messageId} の要素が見つかりませんでした。`);
    }
  };

  useEffect(() => {
    console.log('--- ChatRoom useEffect (接続・履歴取得) が実行されました ---');
    console.log('  現在の joined 状態:', joined);
    if (!joined) return;

    console.log('--- ChatRoom: チャットルーム参加済み、Socket.IO接続を試みます。---');
    socket.connect();
    socket.emit('join_room', roomId);
    console.log(`--- ChatRoom: ルーム ${roomId} に参加イベントを送信しました。---`);

    // メッセージ履歴の取得
    console.log(`--- ChatRoom: メッセージ履歴を ${BACKEND_API_URL}/api/messages/${roomId} から取得します。---`);
    fetch(`${BACKEND_API_URL}/api/messages/${roomId}`)
      .then(response => {
        console.log('--- ChatRoom: メッセージ履歴Fetchのレスポンスを受信しました。Status:', response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('--- ChatRoom: メッセージ履歴データを受信しました:', data);
        const loadedMessages = data.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp) // Dateオブジェクトに変換
        }));
        setMessages(loadedMessages);
        setTimeout(scrollToBottom, 100);
      })
      .catch(error => console.error('--- ChatRoom: メッセージ履歴取得エラー ---:', error));

    socket.on('receive_message', (message: Message) => {
      console.log('--- ChatRoom: 「receive_message」イベントを受信しました ---:', message);
      const receivedMessage: Message = {
        ...message,
        timestamp: new Date(message.timestamp)
      };
      setMessages((prevMessages) => [...prevMessages, receivedMessage]);
    });

    return () => {
      console.log('--- ChatRoom クリーンアップ：Socketをオフ、切断します。---');
      socket.off('receive_message');
      socket.disconnect();
      console.log('--- ChatRoom Socket disconnected ---');
    };
  }, [joined, roomId, userId]);

  useEffect(() => {
    console.log('--- ChatRoom useEffect (メッセージ更新) が実行されました。メッセージ数:', messages.length);
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (replyTo || newMessage.startsWith('@')) {
        messageInputRef.current?.focus();
    }
  }, [replyTo, newMessage]);

  const handleJoinRoom = () => {
    console.log('--- ChatRoom: 「チャットに参加」ボタンがクリックされました。---');
    console.log('  入力されたルームID:', roomId, 'ユーザー名:', username);
    if (roomId.trim() && username.trim()) {
      setJoined(true);
      console.log('--- ChatRoom: チャットに参加状態をtrueに設定しました。---');
    } else {
      alert('ルームIDとユーザー名を入力してください。');
      console.log('--- ChatRoom: ルームIDまたはユーザー名が空です。---');
    }
  };

  const handleSendMessage = () => {
    console.log('--- ChatRoom: handleSendMessage が実行されました ---');
    console.log('  現在のnewMessage (入力欄の値):', newMessage);
    console.log('  現在のjoined (チャット参加状態):', joined);

    if (newMessage.trim() && joined) {
      console.log('--- ChatRoom: メッセージ送信条件が満たされました。Socket.IOでメッセージを送信します:', newMessage.trim());
      console.log('  Socket.IO is connected:', socket.connected);
      console.log('  Socket.IO ID:', socket.id);

      const messageData: Message = {
        id: uuidv4(),
        roomId,
        userId,
        username,
        message: newMessage.trim(),
        timestamp: new Date(),
      };

      if (replyTo) {
        messageData.replyToMessageId = replyTo.id;
        messageData.replyToMessageContent = replyTo.content;
        messageData.replyToUsername = replyTo.username;
      }

      socket.emit('send_message', messageData);
      setNewMessage('');
      setReplyTo(null);
      console.log('--- ChatRoom: Socket.IO emit が呼び出されました。入力欄をクリアしました。---');
    } else {
      console.log('--- ChatRoom: メッセージ送信条件が満たされませんでした。メッセージは送信されません。---');
      if (!newMessage.trim()) {
          console.log('  理由: メッセージが空です。');
      }
      if (!joined) {
          console.log('  理由: チャットに参加していません。');
      }
    }
  };

  // 吹き出し全体ではなく、特定のエリアをクリックでリプライを設定する関数
  const handleReplyAreaClick = (message: Message) => {
    setReplyTo({
      id: message.id,
      content: message.message,
      username: message.username
    });
    messageInputRef.current?.focus();
  };

  // リプライ内容部分をクリックで元のメッセージへスクロールする関数
  const handleScrollToReplySource = (e: React.MouseEvent, replyToMessageId: string) => {
    e.stopPropagation(); // 吹き出し全体へのonClickイベントが発火しないようにする
    scrollToMessage(replyToMessageId);
  };

  const handleMentionClick = (userName: string) => {
    setNewMessage((prevMessage) => {
      const mention = `@${userName} `;
      if (prevMessage.includes(mention)) {
        return prevMessage;
      }
      return prevMessage + mention;
    });
    messageInputRef.current?.focus();
  };

  // ★ 新しく追加するルーム退出のハンドラ
  const handleLeaveRoom = () => {
    console.log('--- ChatRoom: 「ルームを退出」ボタンがクリックされました。---');
    socket.emit('leave_room', roomId); // サーバーにルーム退出を通知 (必要であれば)
    socket.disconnect(); // Socket.IO接続を切断
    setJoined(false); // 参加状態をリセットして参加画面に戻る
    setRoomId(''); // ルームIDをクリア
    setMessages([]); // メッセージをクリア
    setNewMessage(''); // 入力中のメッセージをクリア
    setReplyTo(null); // リプライ状態をクリア
    console.log('--- ChatRoom: ルームを退出しました。---');
  };


  if (!joined) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>匿名チャットルームに参加</h1>
        <input
          type="text"
          style={styles.input}
          placeholder="ルームIDを入力"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <input
          type="text"
          style={styles.input}
          placeholder="あなたの名前 (匿名)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button style={styles.button} onClick={handleJoinRoom} disabled={!roomId || !username}>
          チャットに参加
        </button>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.roomHeader}> {/* ルームタイトルと退出ボタンを囲むdivを追加 */}
        <h2 style={styles.roomTitle}>ルーム: {roomId}</h2>
        <button style={styles.leaveButton} onClick={handleLeaveRoom}>
          ルームを退出
        </button>
      </div>
      <div style={styles.messagesContainer}>
        {messages.map((item, index) => {
          const isMyMessage = item.userId === userId;
          const messageDate = formatDate(item.timestamp);
          const prevMessageDate = index > 0 ? formatDate(messages[index - 1].timestamp) : '';

          const showDateLine = messageDate !== prevMessageDate;

          return (
            <React.Fragment key={item.id}>
              {showDateLine && (
                <div style={styles.dateLine}>
                  <hr style={styles.hr} />
                  <span style={styles.dateText}>{messageDate}</span>
                  <hr style={styles.hr} />
                </div>
              )}
              <div 
                ref={el => messageRefs.current[item.id] = el} // 各メッセージにRefを設定
                style={isMyMessage ? styles.myMessageBubbleGroup : styles.otherMessageBubbleGroup}
              >
                {item.userId !== userId && (
                  <div 
                    style={styles.usernameAboveBubble}
                    onClick={() => handleMentionClick(item.username)}
                  >
                    {item.username}
                  </div>
                )}
                <div style={isMyMessage ? styles.messageAndTimeContainerMy : styles.messageAndTimeContainerOther}> 
                  {isMyMessage && (
                    <div style={styles.timestampTextMyBubbleSide}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}

                  <div
                    style={{
                      ...styles.messageBubble,
                      ...(isMyMessage ? styles.myMessage : styles.otherMessage),
                    }}
                  >
                    {item.replyToMessageContent && (
                        <div 
                          style={styles.replyContentWrapper}
                          onClick={(e) => item.replyToMessageId && handleScrollToReplySource(e, item.replyToMessageId)}
                        >
                            <div style={styles.replyContentHeader}>
                                <div style={styles.replyContentUsername}>{item.replyToUsername}</div>
                                <div style={styles.replyContentText}>{item.replyToMessageContent}</div>
                            </div>
                            <div style={styles.replyContentDivider}></div>
                        </div>
                    )}
                    <div 
                      style={{
                        ...styles.messageBodyText,
                        marginTop: item.replyToMessageContent ? '5px' : '0',
                      }}
                      onClick={() => handleReplyAreaClick(item)} // メッセージ本文のクリックでリプライ設定
                    >{item.message}</div>
                  </div>

                  {!isMyMessage && (
                    <div style={styles.timestampTextOtherBubbleSide}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputContainer}>
        {replyTo && (
          <div style={styles.replyPreview}>
            <div style={styles.replyPreviewContent}>
              <div style={styles.replyPreviewUsername}>返信先: {replyTo.username}</div>
              <div style={styles.replyPreviewText}>{replyTo.content}</div>
            </div>
            <button style={styles.replyPreviewCloseButton} onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}
        <div style={styles.messageInputAndButtonWrapper}>
            <textarea
                ref={messageInputRef}
                style={styles.chatInput}
                placeholder="メッセージを入力..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                    }
                }}
                rows={1}
            />
            <button style={styles.sendButton} onClick={handleSendMessage} disabled={!newMessage.trim()}>
              送信
            </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#f0f2f5',
    padding: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#333',
  },
  input: {
    width: '100%',
    maxWidth: '400px',
    padding: '12px',
    marginBottom: '15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fff',
    fontSize: '16px',
  },
  button: {
    padding: '12px 25px',
    fontSize: '18px',
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '600px',
    margin: '0 auto',
    border: '1px solid #ddd',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  roomHeader: { // ルームタイトルとボタンを配置するための新しいスタイル
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#f0f2f5',
    borderBottom: '1px solid #ddd',
  },
  roomTitle: {
    fontSize: '20px',
    margin: '0',
    textAlign: 'center',
    flexGrow: 1, // タイトルが利用可能なスペースを占有するように
  },
  leaveButton: { // ルーム退出ボタンのスタイル
    padding: '8px 15px',
    fontSize: '14px',
    backgroundColor: '#ff4d4f', // 赤系の色
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    marginLeft: '10px', // タイトルとの間隔
  },
  messagesContainer: {
    flex: 1,
    padding: '15px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  myMessageBubbleGroup: {
    alignSelf: 'flex-end',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: '80%',
    marginBottom: '8px',
  },
  otherMessageBubbleGroup: {
    alignSelf: 'flex-start',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '80%',
    marginBottom: '8px',
  },
  usernameAboveBubble: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '2px',
    color: '#555',
    paddingLeft: '10px',
    paddingRight: '10px',
    cursor: 'pointer',
  },
  messageAndTimeContainerMy: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: '5px',
    width: '100%',
  },
  messageAndTimeContainerOther: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: '5px',
    width: '100%',
  },
  messageBubble: {
    padding: '10px',
    borderRadius: '15px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
  },
  myMessage: {
    backgroundColor: '#007AFF',
    color: '#fff',
    borderBottomRightRadius: '2px',
  },
  otherMessage: {
    backgroundColor: '#E5E5EA',
    color: '#333',
    borderBottomLeftRadius: '2px',
  },
  messageText: {
    fontSize: '16px',
    wordBreak: 'break-word',
  },
  messageBodyText: {
    fontSize: '16px',
    wordBreak: 'break-word',
    textAlign: 'left',
    width: '100%',
    paddingTop: '0',
    paddingBottom: '0',
    cursor: 'pointer',
  },
  timestampTextMyBubbleSide: {
    fontSize: '10px',
    color: '#888',
    minWidth: '35px',
    textAlign: 'right',
  },
  timestampTextOtherBubbleSide: {
    fontSize: '10px',
    color: '#888',
    minWidth: '35px',
    textAlign: 'left',
  },
  inputContainer: {
    display: 'flex',
    flexDirection: 'column',
    padding: '10px',
    borderTop: '1px solid #ddd',
    backgroundColor: '#f9f9f9',
    paddingBottom: 'min(10px, 2vh)',
  },
  messageInputAndButtonWrapper: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: '10px',
    width: '100%',
  },
  chatInput: {
    flex: 1,
    border: '1px solid #ddd',
    borderRadius: '20px',
    padding: '8px 15px',
    fontSize: '16px',
    resize: 'none',
    overflowY: 'auto',
    minHeight: '40px',
    maxHeight: '120px',
    lineHeight: '24px',
  },
  sendButton: {
    padding: '8px 15px',
    fontSize: '16px',
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    minWidth: '60px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLine: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    margin: '20px 0',
    width: '100%',
    justifyContent: 'center',
  },
  hr: {
    flex: 1,
    border: 'none',
    borderTop: '1px solid #ccc',
    margin: '0 10px',
  },
  dateText: {
    fontSize: '12px',
    color: '#888',
    backgroundColor: '#f0f2f5',
    padding: '0 8px',
    borderRadius: '10px',
  },
  replyPreview: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#e9e9e9',
    borderRadius: '8px',
    padding: '8px 10px',
    marginBottom: '8px',
    borderLeft: '4px solid #007AFF',
    justifyContent: 'space-between',
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewUsername: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#555',
    marginBottom: '2px',
  },
  replyPreviewText: {
    fontSize: '14px',
    color: '#777',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  replyPreviewCloseButton: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#888',
    cursor: 'pointer',
    marginLeft: '10px',
  },
  replyContentWrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  replyContentHeader: {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '5px',
  },
  replyContentUsername: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '2px',
    opacity: 0.7,
  },
  replyContentText: {
    fontSize: '13px',
    color: '#555',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    textAlign: 'left',
    opacity: 0.7,
  },
  replyContentDivider: {
    borderBottom: '1px solid #ccc',
    width: '100%',
    marginBottom: '3px',
    opacity: 0.5,
  },
};

export default ChatRoom;