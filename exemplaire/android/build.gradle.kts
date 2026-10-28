// EXEMPLAIRE pour Android : un seul écran qui affiche le jeu web, embarqué dans l'APK.
// Avant de fabriquer l'APK, construire le jeu : `npm run build` dans le dossier parent (crée ../dist).
plugins {
    id("com.android.application") version "9.4.1"
}

// Sur GitHub, le numéro du passage sert de numéro de version : chaque nouvel APK s'installe par-dessus l'ancien.
val numero = (System.getenv("NUMERO_VERSION") ?: "1").toInt()

android {
    namespace = "io.github.loscripts.exemplaire"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.loscripts.exemplaire"
        minSdk = 26
        targetSdk = 36
        versionCode = numero
        versionName = "1.$numero"
    }

    // Clé publique, volontairement dans le dépôt : elle ne protège rien, elle permet
    // seulement d'installer chaque nouvelle version par-dessus l'ancienne.
    // Pour une publication sur le Play Store, il faudra une vraie clé, secrète.
    signingConfigs {
        create("publique") {
            storeFile = file("cle-exemplaire.jks")
            storePassword = "exemplaire"
            keyAlias = "exemplaire"
            keyPassword = "exemplaire"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("publique")
        }
    }

    // Le jeu construit (../dist) devient le contenu de assets/ : index.html à la racine
    sourceSets {
        getByName("main") {
            assets.srcDir("../dist")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.webkit:webkit:1.18.0")
}
