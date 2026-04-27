package com.ddzhilian.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DdzhilianColorScheme = lightColorScheme(
    primary = ActionGreen,
    onPrimary = SurfaceWhite,
    secondary = BubbleGreen,
    background = WindowGray,
    surface = SurfaceWhite,
    onSurface = PrimaryText,
    onBackground = PrimaryText,
    outline = DividerGray,
)

@Composable
fun DdzhilianTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DdzhilianColorScheme,
        typography = DdzhilianTypography,
        content = content,
    )
}
