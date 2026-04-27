package com.ddzhilian.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.ddzhilian.mobile.ui.theme.ActionGreen
import com.ddzhilian.mobile.ui.theme.BubbleGreen
import com.ddzhilian.mobile.ui.theme.DdzhilianTheme
import com.ddzhilian.mobile.ui.theme.DividerGray
import com.ddzhilian.mobile.ui.theme.HoverGray
import com.ddzhilian.mobile.ui.theme.PanelGray
import com.ddzhilian.mobile.ui.theme.SidebarGray
import com.ddzhilian.mobile.ui.theme.SurfaceWhite
import com.ddzhilian.mobile.ui.theme.TertiaryText
import com.ddzhilian.mobile.ui.theme.WindowGray

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DdzhilianTheme {
                DdzhilianApp()
            }
        }
    }
}

private enum class HomeTab(val label: String, val icon: String) {
    Chats("会话", "聊"),
    Connect("连接", "连"),
    Transfer("传输", "传"),
    Me("我的", "我"),
}

private data class ConversationItem(
    val id: String,
    val title: String,
    val preview: String,
    val time: String,
    val unreadCount: Int = 0,
)

private data class ChatMessage(
    val id: String,
    val sender: String,
    val body: String,
    val time: String,
    val fromSelf: Boolean,
)

private data class DeviceItem(
    val name: String,
    val platform: String,
    val code: String,
    val relation: String,
    val online: Boolean,
)

private data class TransferRecord(
    val fileName: String,
    val target: String,
    val progress: Float,
    val status: String,
    val sizeLabel: String,
)

private val sampleConversations = listOf(
    ConversationItem("room-a", "MacBook Pro", "已收到设计稿与 APK 包", "14:23", 2),
    ConversationItem("room-b", "办公室电脑", "互传码已更新，等待连接", "13:08"),
    ConversationItem("room-c", "Pixel 设备", "共享文件夹同步完成", "昨天"),
)

private val sampleMessages = listOf(
    ChatMessage("m1", "MacBook Pro", "已经把 APK 安装到测试机，准备回传日志。", "14:08", false),
    ChatMessage("m2", "我", "先把最新截图发我，我核对移动端布局。", "14:10", true),
    ChatMessage("m3", "MacBook Pro", "好的，文件和截图都进当前会话。", "14:18", false),
    ChatMessage("m4", "我", "收到后我再继续调接收与长文本页。", "14:19", true),
)

private val sampleDevices = listOf(
    DeviceItem("Pixel 9 Pro", "Android 15", "Q7M2", "同账号设备", true),
    DeviceItem("MacBook Pro", "macOS", "A4K9", "同网设备", true),
    DeviceItem("办公室台式机", "Windows", "H8X3", "可连接设备", false),
)

private val sampleTransfers = listOf(
    TransferRecord("ddzhilian-debug.apk", "Pixel 9 Pro", 0.86f, "传输中", "38.2 MB"),
    TransferRecord("UI-参考图.png", "MacBook Pro", 1f, "已完成", "4.6 MB"),
    TransferRecord("logs-0427.zip", "办公室台式机", 0.34f, "等待确认", "12.8 MB"),
)

@Composable
private fun DdzhilianApp() {
    var currentTab by rememberSaveable { mutableStateOf(HomeTab.Chats) }
    var messageDraft by rememberSaveable { mutableStateOf("") }
    var joinCode by rememberSaveable { mutableStateOf("Q7M2") }
    var selectedConversationId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedConversation = sampleConversations.firstOrNull { it.id == selectedConversationId }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = WindowGray,
    ) {
        Scaffold(
            containerColor = WindowGray,
            bottomBar = {
                BottomNavigationBar(
                    currentTab = currentTab,
                    onSelect = { currentTab = it },
                )
            },
        ) { innerPadding ->
            when (currentTab) {
                HomeTab.Chats -> {
                    if (selectedConversation == null) {
                        ChatListScreen(
                            innerPadding = innerPadding,
                            onOpenConversation = { selectedConversationId = it.id },
                        )
                    } else {
                        ConversationDetailScreen(
                            innerPadding = innerPadding,
                            conversation = selectedConversation,
                            messageDraft = messageDraft,
                            onMessageDraftChange = { messageDraft = it },
                            onBack = { selectedConversationId = null },
                        )
                    }
                }
                HomeTab.Connect -> ConnectScreen(innerPadding, joinCode) { joinCode = it }
                HomeTab.Transfer -> TransferScreen(innerPadding)
                HomeTab.Me -> MeScreen(innerPadding)
            }
        }
    }
}

@Composable
private fun BottomNavigationBar(
    currentTab: HomeTab,
    onSelect: (HomeTab) -> Unit,
) {
    BottomAppBar(
        containerColor = PanelGray,
        tonalElevation = 0.dp,
        modifier = Modifier.navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HomeTab.entries.forEach { tab ->
                val active = currentTab == tab
                TextButton(
                    onClick = { onSelect(tab) },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(if (active) BubbleGreen else SidebarGray),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = tab.icon,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = tab.label,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (active) MaterialTheme.colorScheme.onSurface else TertiaryText,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatListScreen(
    innerPadding: PaddingValues,
    onOpenConversation: (ConversationItem) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeaderBlock(
                title = "ddzhilian",
                subtitle = "跨设备互传与会话工作台",
                action = "公共 room",
            )
        }

        item {
            SectionTitle(title = "会话列表", trailing = "${sampleConversations.size} 个会话")
        }

        items(sampleConversations) { item ->
            ConversationRow(
                item = item,
                onClick = { onOpenConversation(item) },
            )
        }
    }
}

@Composable
private fun ConversationDetailScreen(
    innerPadding: PaddingValues,
    conversation: ConversationItem,
    messageDraft: String,
    onMessageDraftChange: (String) -> Unit,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
    ) {
        ConversationHeader(
            title = conversation.title,
            subtitle = conversation.preview,
            onBack = onBack,
        )

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item {
                ChatPanel(messages = sampleMessages)
            }
        }

        FloatingComposer(
            value = messageDraft,
            onValueChange = onMessageDraftChange,
            targetLabel = conversation.title,
        )
    }
}

@Composable
private fun ConnectScreen(
    innerPadding: PaddingValues,
    joinCode: String,
    onJoinCodeChange: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeaderBlock(
                title = "连接设备",
                subtitle = "输入互传码或选择可见设备",
                action = "刷新",
            )
        }

        item {
            HighlightCard {
                Text("我的互传码", style = MaterialTheme.typography.labelLarge, color = TertiaryText)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Q7M2-A7", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                Text("pair token: ddz-live-mobile-0427", style = MaterialTheme.typography.bodyMedium, color = TertiaryText)
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
                border = BorderStroke(1.dp, DividerGray),
                shape = RoundedCornerShape(20.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("输入互传码", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = joinCode,
                        onValueChange = { onJoinCodeChange(it.uppercase()) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("互传码") },
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {},
                            colors = ButtonDefaults.buttonColors(containerColor = ActionGreen),
                        ) {
                            Text("连接设备")
                        }
                        OutlinedButton(onClick = {}) {
                            Text("查看快照")
                        }
                    }
                }
            }
        }

        item {
            HighlightCard {
                Text("发送文件", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(8.dp))
                Text("发送文件入口放在连接页，先选设备，再把 APK、截图或日志放进当前会话。", color = TertiaryText)
                Spacer(modifier = Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {},
                        colors = ButtonDefaults.buttonColors(containerColor = ActionGreen),
                    ) {
                        Text("共享文件")
                    }
                    OutlinedButton(onClick = {}) {
                        Text("发送到当前设备")
                    }
                }
            }
        }

        item {
            SectionTitle(title = "在线设备", trailing = "${sampleDevices.size} 台设备")
        }

        items(sampleDevices) { item ->
            DeviceRow(item)
        }
    }
}

@Composable
private fun TransferScreen(innerPadding: PaddingValues) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeaderBlock(
                title = "发送文件",
                subtitle = "当前目标：Pixel 9 Pro",
                action = "队列",
            )
        }

        item {
            SectionTitle(title = "传输队列", trailing = "${sampleTransfers.size} 个任务")
        }

        items(sampleTransfers) { item ->
            TransferRow(item)
        }
    }
}

@Composable
private fun MeScreen(innerPadding: PaddingValues) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeaderBlock(
                title = "我的设备",
                subtitle = "移动端 MVP 示例壳",
                action = "设置",
            )
        }

        item {
            HighlightCard {
                Text("当前实现说明", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(8.dp))
                Text("这版 APK 先验证移动端信息架构、视觉层级和 Compose 工程可构建性，后续再逐步对接真实 WebSocket 与文件传输逻辑。", color = TertiaryText)
            }
        }
    }
}

@Composable
private fun HeaderBlock(
    title: String,
    subtitle: String,
    action: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PanelGray)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = TertiaryText)
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(HoverGray)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(action, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun SectionTitle(title: String, trailing: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(trailing, style = MaterialTheme.typography.labelMedium, color = TertiaryText)
    }
}

@Composable
private fun ConversationRow(
    item: ConversationItem,
    onClick: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, DividerGray),
        shape = RoundedCornerShape(18.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(SidebarGray),
                contentAlignment = Alignment.Center,
            ) {
                Text(item.title.take(1), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    item.preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TertiaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(item.time, style = MaterialTheme.typography.labelMedium, color = TertiaryText)
                if (item.unreadCount > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(ActionGreen)
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text(item.unreadCount.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationHeader(
    title: String,
    subtitle: String,
    onBack: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PanelGray)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onBack, contentPadding = PaddingValues(0.dp)) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "返回",
                tint = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text("返回", color = MaterialTheme.colorScheme.onSurface)
        }
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = TertiaryText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ChatPanel(messages: List<ChatMessage>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, DividerGray),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            messages.forEach { message ->
                Column(
                    horizontalAlignment = if (message.fromSelf) Alignment.End else Alignment.Start,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(message.sender, style = MaterialTheme.typography.labelMedium, color = TertiaryText)
                    Spacer(modifier = Modifier.height(2.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (message.fromSelf) BubbleGreen else WindowGray)
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                    ) {
                        Text(message.body, style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(message.time, style = MaterialTheme.typography.labelSmall, color = TertiaryText)
                }
                HorizontalDivider(color = DividerGray.copy(alpha = 0.55f))
            }
        }
    }
}

@Composable
private fun FloatingComposer(
    value: String,
    onValueChange: (String) -> Unit,
    targetLabel: String,
) {
    Surface(
        shadowElevation = 2.dp,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        color = PanelGray,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ComposerChip("表情")
                ComposerChip("文件")
                ComposerChip("链接")
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                placeholder = { Text("输入消息、互传码、链接或长文本") },
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("当前目标：$targetLabel", style = MaterialTheme.typography.labelLarge, color = TertiaryText)
                Button(
                    onClick = {},
                    colors = ButtonDefaults.buttonColors(containerColor = ActionGreen),
                ) {
                    Text("发送")
                }
            }
        }
    }
}

@Composable
private fun ComposerChip(label: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(SurfaceWhite)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun DeviceRow(item: DeviceItem) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, DividerGray),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (item.online) ActionGreen else TertiaryText),
                )
            }
            Text("${item.platform} · ${item.code}", color = TertiaryText)
            Text(item.relation, style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {},
                    colors = ButtonDefaults.buttonColors(containerColor = ActionGreen),
                ) {
                    Text("连接")
                }
                OutlinedButton(onClick = {}) {
                    Text("查看详情")
                }
            }
        }
    }
}

@Composable
private fun TransferRow(item: TransferRecord) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, DividerGray),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.fileName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("${item.target} · ${item.sizeLabel}", color = TertiaryText)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(WindowGray)
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Text(item.status, style = MaterialTheme.typography.labelLarge)
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(WindowGray),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(item.progress)
                        .height(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(ActionGreen),
                )
            }

            Text("${(item.progress * 100).toInt()}%", color = TertiaryText)
        }
    }
}

@Composable
private fun HighlightCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, DividerGray),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            content = content,
        )
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
private fun DdzhilianPreview() {
    DdzhilianTheme {
        DdzhilianApp()
    }
}
