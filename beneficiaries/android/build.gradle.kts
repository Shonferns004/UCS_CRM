allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Force compileSdk 36 on all modules (file_picker & others still target 34).
// Must be registered before any project evaluation is triggered.
subprojects {
    afterEvaluate {
        if (project.hasProperty("android")) {
            (extensions.findByName("android") as com.android.build.gradle.BaseExtension).apply {
                compileSdkVersion(36)
            }
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}