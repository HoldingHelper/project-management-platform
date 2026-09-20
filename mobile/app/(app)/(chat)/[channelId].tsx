import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Mic, Send } from "lucide-react-native";
import { Avatar, Header } from "@/components/ds";
import { Api } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { relativeTime } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";
import { colors } from "@/theme/colors";

export default function ChatRoomScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (channelId) loadMessages();
  }, [channelId]);

  async function loadMessages() {
    try {
      const data = await Api.listMessages(channelId);
      setMessages(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);
    try {
      const newMsg = await Api.sendMessage(channelId, text, "text");
      setMessages((prev) => [...prev, newMsg]);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Channel"
        subtitle="Real-time messaging"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        style={{ flex: 1 }}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => {
              const isMe = user?.id === item.sender_user_id;
              return (
                <View
                  style={[
                    styles.messageRow,
                    isMe ? styles.myRow : styles.theirRow,
                  ]}
                >
                  {!isMe && (
                    <Avatar
                      name={item.sender_name}
                      url={item.sender_avatar}
                      size={30}
                    />
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isMe ? styles.myBubble : styles.theirBubble,
                    ]}
                  >
                    {!isMe && (
                      <Text style={styles.senderName}>{item.sender_name || "Team Member"}</Text>
                    )}
                    <Text
                      style={[
                        styles.messageText,
                        isMe ? styles.myMessageText : styles.theirMessageText,
                      ]}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={[
                        styles.timestamp,
                        isMe ? styles.myTimestamp : styles.theirTimestamp,
                      ]}
                    >
                      {relativeTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Write a message..."
            placeholderTextColor={colors.textTertiary}
            style={styles.textInput}
            multiline
          />
          <TouchableOpacity
            style={styles.micBtn}
            onPress={() => {
              // Voice note quick capture trigger
            }}
          >
            <Mic size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            disabled={!inputText.trim() || sending}
            onPress={handleSend}
          >
            <Send size={18} color="#000000" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  messageRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  myRow: {
    justifyContent: "flex-end",
  },
  theirRow: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
  },
  myMessageText: {
    color: "#000000",
    fontWeight: "500",
  },
  theirMessageText: {
    color: colors.text,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  myTimestamp: {
    color: "rgba(0,0,0,0.6)",
  },
  theirTimestamp: {
    color: colors.textTertiary,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
    maxHeight: 100,
  },
  micBtn: {
    padding: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
