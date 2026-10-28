package io.github.loscripts.exemplaire

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

// Toute l'appli tient dans cet écran : le jeu web, lu depuis les fichiers de l'APK.
// WebViewAssetLoader les sert sous une adresse https : depuis file://, les modules
// JavaScript du jeu seraient refusés. Le jeu marche donc aussi sans réseau.
class Ecran : ComponentActivity() {

    private lateinit var vue: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(etat: Bundle?) {
        super.onCreate(etat)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val chargeur = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        vue = WebView(this)
        vue.setBackgroundColor(0xFFFFD23F.toInt())
        with(vue.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true           // localStorage : pseudo, corps hors ligne
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100                     // la taille de police système ne casse pas la mise en page
        }
        vue.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, requete: WebResourceRequest): WebResourceResponse? =
                chargeur.shouldInterceptRequest(requete.url)

            // Le jeu ne doit jamais naviguer ailleurs que dans ses propres fichiers
            override fun shouldOverrideUrlLoading(v: WebView, requete: WebResourceRequest): Boolean =
                requete.url.host != HOTE

            // Si le moteur du navigateur meurt (mémoire), on relance l'écran plutôt que de planter
            override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }
        // La console du jeu va dans le journal Android (étiquette « Exemplaire ») :
        // c'est là que l'essai automatique lit ses résultats et les erreurs JavaScript.
        vue.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i("Exemplaire", "${m.messageLevel()} ${m.message()} [${m.sourceId().substringAfterLast('/')}:${m.lineNumber()}]")
                return true
            }
        }
        setContentView(vue)
        pleinEcran()

        // Bouton retour : le jeu décide (fermer une étiquette, mettre en pause, revenir au titre).
        // S'il répond false, on est sur l'écran titre : on quitte.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                vue.evaluateJavascript("window.retourAndroid ? window.retourAndroid() : false") { gere ->
                    if (gere != "true") finish()
                }
            }
        })

        // --ez essai true (essai automatique) : le jeu joue tout seul, sans réseau
        val essai = if (intent.getBooleanExtra("essai", false)) "?essai=1" else ""
        if (etat == null) vue.loadUrl("https://$HOTE/assets/index.html$essai") else vue.restoreState(etat)
    }

    private fun pleinEcran() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(focus: Boolean) {
        super.onWindowFocusChanged(focus)
        if (focus) pleinEcran()
    }

    override fun onSaveInstanceState(etat: Bundle) {
        super.onSaveInstanceState(etat)
        vue.saveState(etat)
    }

    override fun onPause() {
        vue.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        vue.onResume()
    }

    override fun onDestroy() {
        vue.destroy()
        super.onDestroy()
    }

    private companion object {
        const val HOTE = "appassets.androidplatform.net"
    }
}
