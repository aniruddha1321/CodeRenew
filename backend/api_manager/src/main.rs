use base64::{engine::general_purpose, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use clap::Parser;
use dirs::config_dir;
use rand::RngCore;
use std::{collections::HashMap, fs::create_dir, path::PathBuf};

const SERVICE: &str = "legacy_code_modernizer_api_manager";
const FILE_NAME: &str = "api.enc";
const KEY_FILE_NAME: &str = "key.txt";

#[derive(Parser, Debug)]
#[command(
    name = SERVICE,
    version = "0.1.0",
    about = "Legacy Code Modernizer Api Keys Save and Encrypt Tool",
    arg_required_else_help = true
)]
struct Args {
    /// Set provider
    provider: String,
    /// Set or Update Api key
    #[arg(short, long, conflicts_with_all = ["get", "delete"])]
    set: Option<String>,
    /// Get provider's api key
    #[arg(short, long, conflicts_with_all = ["set", "delete"])]
    get: bool,
    /// Delete provider's api key
    #[arg(short, long, conflicts_with_all = ["set", "get"])]
    delete: bool,
}

fn is_key_exist() -> bool {
    get_key_path().exists()
}

fn setup_key() -> Result<(), String> {
    let mut key = [0u8; 32];
    rand::rng().fill_bytes(&mut key);
    let encoded_key = general_purpose::STANDARD.encode(&key);
    std::fs::write(get_key_path(), encoded_key)
        .map_err(|e| format!("Failed to write key file: {}", e))?;
    Ok(())
}

fn load_key() -> Result<[u8; 32], String> {
    let encoded_key = std::fs::read_to_string(get_key_path())
        .map_err(|e| format!("Failed to read key file: {}", e))?;
    let decoded = general_purpose::STANDARD
        .decode(encoded_key.trim())
        .map_err(|e| format!("Failed to decode key: {}", e))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid key length: expected 32, got {}",
            decoded.len()
        ));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&decoded);
    Ok(key)
}

fn load_config() -> Result<HashMap<String, String>, ()> {
    let config_path = get_config_path();
    if !is_key_exist() {
        setup_key().unwrap();
    }
    if !config_path.exists() {
        return Ok(HashMap::new());
    }

    let key = load_key().unwrap();
    let encrypted = match std::fs::read_to_string(config_path) {
        Ok(val) => val,
        Err(_) => return Err(()), // Should not happen due to the check above, but good practice.
    };

    let json = decrypt_config(&key, &encrypted).unwrap();
    Ok(serde_json::from_slice(&json).unwrap())
}

/// Use XChaCha20-Poly1305 Decrypt
fn decrypt_config(key: &[u8; 32], ciphertext_b64: &str) -> Result<Vec<u8>, ()> {
    let data = general_purpose::URL_SAFE_NO_PAD
        .decode(ciphertext_b64)
        .unwrap();
    let (nonce_bytes, ct) = data.split_at(24);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    Ok(cipher.decrypt(nonce_bytes.into(), ct).unwrap())
}

/// Use XChaCha20-Poly1305 Encrypt
fn encrypt_config(key: &[u8; 32], plaintext: &[u8]) -> Result<String, ()> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let mut nonce = XNonce::default();
    rand::rng().fill_bytes(nonce.as_mut());
    let ciphertext = cipher.encrypt(&nonce, plaintext).unwrap();
    let mut combined = nonce.as_slice().to_vec();
    combined.extend(ciphertext);
    Ok(general_purpose::URL_SAFE_NO_PAD.encode(combined))
}

fn make_folder(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        create_dir(path.clone()).unwrap();
    }
    // file exist, test if it's a dir
    if path.is_dir() {
        Ok(())
    } else {
        Err(String::from("Path is not a folder"))
    }
}

fn get_config_path() -> PathBuf {
    let path = config_dir()
        .expect("Could not get config directory")
        .join(SERVICE);
    make_folder(&path).unwrap();
    path.join(FILE_NAME)
}

fn get_key_path() -> PathBuf {
    let path = config_dir()
        .expect("Could not get config directory")
        .join(SERVICE);
    make_folder(&path).unwrap();
    path.join(KEY_FILE_NAME)
}

fn save_config_safe(cfg: &HashMap<String, String>) -> Result<(), String> {
    if !is_key_exist() {
        println!("Setting up new encryption key...");
        setup_key()?;
    }
    let key = load_key()?;
    let new_json = serde_json::to_vec_pretty(&cfg)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    let enc =
        encrypt_config(&key, &new_json).map_err(|_| "Failed to encrypt config".to_string())?;
    std::fs::write(get_config_path(), enc)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    Ok(())
}

fn main() {
    let config = match load_config() {
        Ok(cfg) => cfg,
        Err(_) => {
            eprintln!("Error: Failed to load configuration");
            std::process::exit(1);
        }
    };

    let args = Args::parse();

    if args.get {
        println!(
            "{}",
            serde_json::json!({
                "status": "success",
                "provider": args.provider,
                "key": config.get(&args.provider).unwrap_or(&String::new()),
            })
        );
        return;
    }

    if args.delete {
        let mut config = config;
        config.remove(&args.provider);
        
        match save_config_safe(&config) {
            Ok(_) => {
                println!(
                    "{}",
                    serde_json::json!({
                        "status": "success",
                        "message": format!("API key for {} deleted successfully", args.provider)
                    })
                );
            }
            Err(e) => {
                eprintln!("Error: Failed to delete API key: {}", e);
                std::process::exit(1);
            }
        }
        return;
    }

    let api_key = match args.set {
        Some(key) => key,
        None => {
            eprintln!("Error: API key is required when using --set");
            std::process::exit(1);
        }
    };

    let mut config = config;
    config.insert(args.provider, api_key);

    match save_config_safe(&config) {
        Ok(_) => {
            println!(
                "{}",
                serde_json::json!({
                    "status": "success",
                })
            );
        }
        Err(e) => {
            eprintln!("Error: Failed to save configuration: {}", e);
            std::process::exit(1);
        }
    }
}
