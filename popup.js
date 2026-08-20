// Global variables for potential future use
let fullBusDataForDownload = [];
let fileNameForDownload = "";

// Global variables to store all data for filtering
let allComparisonData = [];
let allRowsData = [];
let totalInventoryBusCount = 0;

// RedBus connection status
let redbusConnectionStatus = false;

// Focus filter state for Flix + IntrCity toggle
let focusFilterActive = false;

// Persistent ND/D status map: key = "lineCode|busProduct" -> "ND" | "D"
let ndStatusMap = {};

function busProduct(isSeater, isSleeper) {
  if (isSeater && isSleeper) return "Hybrid";
  if (isSleeper) return "Sleeper";
  if (isSeater) return "Seater";
  return "Unknown";
}

function ndKey(lineCode, product) {
  return `${lineCode}|${product}`;
}

function loadNdStatusMap(cb) {
  chrome.storage.local.get("ndStatusMap", data => {
    const raw = data.ndStatusMap || {};
    const migrated = {};
    let changed = false;
    Object.entries(raw).forEach(([key, value]) => {
      const parts = key.split("|");
      if (parts.length === 4) {
        // Old format: lineCode|fromCity|toCity|product → new: lineCode|product
        const newKey = `${parts[0]}|${parts[3]}`;
        // Prefer "D" if multiple old keys collapse to the same new key
        if (!migrated[newKey] || value === "D") migrated[newKey] = value;
        changed = true;
      } else {
        migrated[key] = value;
      }
    });
    ndStatusMap = migrated;
    if (changed) chrome.storage.local.set({ ndStatusMap });
    if (cb) cb();
  });
}

function saveNdStatus(key, value) {
  ndStatusMap[key] = value;
  chrome.storage.local.set({ ndStatusMap });
}

// City mapping: name -> Redbus city code
const cities = {
  "Agra": 1290,
  "Alapuzha": 69382,
  "Tiruchirapalli": 71929,
  "Velankanni": 217,
  "Amritsar": 759,
  "Tuticorin": 698,
  "Azamgarh": 90355,
  "Tirunelveli": 696,
  "Bengaluru": 122,
  "Bir": 195703,
  "Vijaypura": 95218,
  "Chandigarh": 833,
  "Kanyakumari": 68738,
  "Chennai": 123,
  "Coimbatore": 141,
  "Dehradun": 777,
  "Delhi": 733,
  "Vellore": 960,
  "Munnar": 286,
  "Bodi": 524,
  "Dharamshala": 65768,
  "Goa": 210,
  "Sawantwadi": 1010,
  "Lonavala": 722,
  "Kankavli": 1008,
  "Sindhudurg": 77346,
  "Satara": 362,
  "Sindhudurg": 77346,
  "Gorakhpur": 78027,
  "Gurugram": 70015,
  "Hyderabad": 124,
  "Indore": 313,
  "Jaipur": 807,
  "Kanpur": 1377,
  "Kasol": 197688,
  "Kathgodam": 77726,
  "Kochi": 216,
  "Kundapur": 163,
  "Lucknow": 1439,
  "Madurai": 126,
  "Manali": 757,
  "Mumbai": 462,
  "Mussorie": 773,
  "Nagercoil": 690,
  "Nagpur": 624,
  "Pathanamthitta": 280,
  "Pondicherry": 233,
  "Prayagraj": 84832,
  "Pune": 130,
  "Shimla": 1285,
  "Shirdi": 403,
  "Tiruchendur": 663,
  "Tirupati": 71756,
  "Udaipur": 470,
  "Udupi": 154,
  "Ujjain": 1001,
  "Varanasi": 70429,
  "Tirunelveli": 696,
  "Belagavi": 95083,
  "Vijayawada": 134,
  "Nellore": 131,
  "Noida": 216383,
  "Jibhi": 298546,
  "Nainital": 771,
  "Bareilly": 1437,
  "Aurangabad": 309,
  "Ongole": 135,
  "Ooty": 254,
  "Vizianagaram": 69217,
  "Kakinada": 316,
  "Rameswaram  ": 496,
  "Udankudi": 951,
  "Cumbum": 81152,
  "Velankanni": 217,
  "Trivandrum": 71425,
  "Thiruvalla": 69057,
  "Kakinada": 316,
  "Dharamkot": 314589,
  "Katra": 735,
  "Visakhapatnam": 248
};

// Initialize RedBus connection and show status
async function initializeRedbusConnection() {
  const statusEl = document.getElementById("redbusStatus");
  
  try {
    // Show loading state
    statusEl.textContent = "Connecting to RedBus...";
    statusEl.className = "redbus-status connecting";
    
    // Send message to background script to initialize RedBus
    const response = await chrome.runtime.sendMessage({ type: "INIT_REDBUS" });
    
    if (response.success) {
      redbusConnectionStatus = true;
      statusEl.textContent = "RedBus Connected ✅";
      statusEl.className = "redbus-status connected";
      return true;
    } else {
      throw new Error(response.error || "Unknown error");
    }
  } catch (error) {
    console.error("Failed to initialize RedBus:", error);
    redbusConnectionStatus = false;
    statusEl.textContent = "RedBus Connection Failed ❌";
    statusEl.className = "redbus-status error";
    return false;
  }
}

// Check RedBus status on popup load
document.addEventListener("DOMContentLoaded", async () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = now.toLocaleString("en-GB", { month: "short" });
  const weekday = now.toLocaleString("en-GB", { weekday: "short" });
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  document.getElementById("currentDateLabel").textContent =
    `${day} ${month} (${weekday}, Wk ${weekNo})`;

  // Check if RedBus is already initialized
  try {
    const status = await chrome.runtime.sendMessage({ type: "CHECK_REDBUS_STATUS" });
    const statusEl = document.getElementById("redbusStatus");
    
    if (status.ready) {
      redbusConnectionStatus = true;
      statusEl.textContent = "RedBus Connected ✅";
      statusEl.className = "redbus-status connected";
    } else {
      statusEl.textContent = "RedBus Not Connected";
      statusEl.className = "redbus-status disconnected";
    }
  } catch (error) {
    console.error("Error checking RedBus status:", error);
  }
});

// Filter buses based on bus type selection
function filterByBusType(buses, filterValue) {
  if (filterValue === "all") return buses;
  
  return buses.filter(bus => {
    const isSeater = bus.isSeater;
    const isSleeper = bus.isSleeper;
    
    // Handle NA values - show in "all" only
    if (isSeater === "NA" || isSleeper === "NA") {
      return filterValue === "all";
    }
    
    switch(filterValue) {
      case "hybrid":
        return isSeater === true && isSleeper === true;
      case "sleeper":
        return isSleeper === true && isSeater === false;
      case "seater":
        return isSeater === true && isSleeper === false;
      default:
        return true;
    }
  });
}

// ===== Line Code & Seat Lookup via Line UUID =====
// Maps FlixBus Line UUID (first 36 chars of serviceId) -> Line Code
// Maps FlixBus Line UUID -> Total Seats (hardcoded from master_india_lines.csv)
// Source: master_india_lines.csv
const LINE_UUID_MAP = {"1f91dcfe-6c36-441b-8ac8-c21cb972be43":"DELIGI01","b496b789-c346-4334-b548-395646d9d6ee":"IN0110","0f1aa3d4-df77-4730-8e54-01f64e0f4e2e":"IN0110A","95572923-ef71-4cf3-8ac7-77104851b017":"IN0120","592aa978-56af-4a3c-98bd-3451653d91b0":"IN0120A","7dbec444-d67e-4eb8-9019-fa4148b754f4":"IN0120B","db480497-d8fd-4f0f-835a-163875d40459":"IN0120C","69096e6f-56c7-4b5a-857c-d9670f8d852f":"IN0120D","e854c90e-7086-4c07-8223-9a46a64ff388":"IN0120F","26a88e60-9865-4bae-84a7-351c6b8f6787":"IN0121","ec18d028-29b3-413a-a15a-7efa504ad5f3":"IN0121A","757bf869-56c7-46b2-939b-71ba3759a7e7":"IN0121B","16ae39f0-cf08-4e9d-875a-3020c95dc747":"IN0121C","b68a588d-ebf4-4ada-8532-057e7bed7ff8":"IN0121D","96e09857-d296-416d-a176-db031d02fac3":"IN0122","63972f6d-b7e8-4437-97f7-5c5e0966a945":"IN0123","317a9a51-0de6-4b73-921e-dae6334f916b":"IN0210","84dfe4fa-9623-4cf7-a21c-268b8eeaf71a":"IN0210A","557534dd-713e-4ab3-9f91-e31093d1ff58":"IN0210B","75d99d81-e5d9-4428-b4c2-823720dc2095":"IN0210C","662f1104-e6f6-480c-8eba-32bbfc5997c9":"IN0210D","e6c19428-2d69-46d1-8c2c-2927d2b7266c":"IN0210E","23750bb4-cc6b-461e-ab14-21c636f7b70d":"IN0211","89567f53-2da1-4b1b-baaf-aefbdcda5ee1":"IN0211B","30bafa9e-4f46-4d66-95da-79a22552f33c":"IN0211C","b0331778-942d-478c-b751-cac180ce1d7a":"IN0212","aded58fd-bb0c-45e3-b6cd-51638968ff3d":"IN0212A","130d0b12-f2b0-4783-8005-8573ca680346":"IN0212B","746c24d8-de45-4a1e-aa48-a46dc375f30a":"IN0212C","22a4a751-d72a-416f-a480-2c803b0f8401":"IN0213","3c7c4278-dcef-43db-92c1-3a55b0f87eed":"IN0213A","8f7da77d-ee56-446b-b4ef-bc9fe5434a0b":"IN0213B","0cb111c4-0e4f-4fc9-9918-32caa6576a6d":"IN0214","6bb878a0-bd20-4ad4-af72-9fb9696e8f55":"IN0214A","72c51962-5e58-492a-921e-7cdd68f161d5":"IN0310","218453a2-cc03-44d1-8840-cbdb60c8e079":"IN0310A","2a69f65d-f9b2-4ad4-b657-948d554c37de":"IN0310B","bfe5b1e4-bff3-4715-8b73-5de6ff98cf77":"IN0310C","92e62b01-1052-44a2-9810-9f93add164e3":"IN0310D","77223855-3b4e-4242-9ffe-1a0d1d9f566f":"IN0310E","fe17591f-fbfc-4479-9897-203d362471ef":"IN0310F","1aecc57b-425e-4804-9599-5db8857c1167":"IN0310G","24c49b22-fcc9-4e97-909e-37308c3c0530":"IN0310H","88f7497e-ac79-4ad8-9e71-fe3f0e54df0e":"IN0310I","7f953dcc-3610-4d4b-b993-3c046f643c8b":"IN0310J","61cf7e33-9946-4a0b-a8d0-023b004df6dd":"IN0310K","86f2b6be-d1b0-40e3-88f6-e535f5c72cc8":"IN0310L","4b619c49-8ed6-4fbd-981d-3486091b5110":"IN0310M","ae2c281e-85ac-4c0e-8649-41ee6b48a3ef":"IN0320","268abe54-c1f5-41cb-885a-ce999a05a1cc":"IN0320A","0c672a51-e005-427b-947b-a39f738a747c":"IN0320B","e24197e0-2dbf-43e2-9c61-76c819360b8a":"IN0320C","288732f9-52e4-445e-9112-3629ecb95fbf":"IN0320D","e1fa0e0a-a170-4ed5-b95f-b7f88f252f46":"IN0410","462461db-7aa9-4130-b372-af49e7e8d823":"IN0410A","73181ec2-b3b1-4981-bc71-ebc4dd4a59e8":"IN0420","93e8ec7a-7ff4-4f4d-a397-49af97bf020c":"IN0420A","0aa0332e-9e86-4e35-8219-dced5ef8d3e2":"IN0421","36e3fc1c-60da-496a-a8fc-b0bf8defb983":"IN0421A","4568ed20-be7c-4375-ac36-d901b4315de3":"IN0421B","fefdb46f-92d0-4c89-bde6-98ea092e3af5":"IN0421C","2efa0764-f95c-45f6-9819-97baf10d9ecd":"IN0422","0392d8fe-1749-48c7-88d0-c2212c937cdf":"IN0423","a09c1cf1-aace-4bc6-820a-c8d4e394d298":"IN0423A","7d4b75c9-a36d-4962-b8c3-a6908c38e6f1":"IN0424","d05ef689-3f28-48a7-804f-f3e464e22d4b":"IN0424A","63f58157-1a22-4c5b-abdf-1da503de7a97":"IN0425","cff5094d-9672-4705-8b45-775f29c0b22b":"IN0426","7e5794e8-2c6c-418c-97b5-35a6654e54f7":"IN0426A","b2e1b3ea-d3dc-4b24-a48b-b5cb3e05c0c2":"IN0426B","efbe9628-2fe0-4a4c-9b79-d978153620d4":"IN0430","a2e1e9bc-c373-4b5a-937c-ce069a1c03be":"IN0430A","b8419be8-3c08-4c9c-b24e-775990b37d37":"IN0510","29ab8429-4444-454f-bd00-d9e4cd94679c":"IN0520","556f243e-bdde-4a9a-83b0-83f96fafd1d0":"IN0520A","8c1d787f-6088-4c5a-b9b1-6ebe4a71a2a8":"IN0520B","34392e36-9ab5-440d-98bc-644f21d11cdc":"IN0520C","247f7368-1ee8-4312-a179-59c9afe1603b":"IN0520D","04970adb-b0e6-4357-8618-50767d2a42e3":"IN0610","efba0533-009b-4f9a-b150-33955802adf0":"IN0610A","de9e09c4-3232-4a46-b26f-5c927497c07b":"IN0613","ebd82b99-ae5d-4b2b-8008-df65c71bedca":"IN0614","9958d1ef-7216-43f2-b19c-4a0dfb81fd08":"IN0614A","626ee11c-429f-4a39-a44f-e9806f83b2c2":"IN0615","3c8926ab-e467-47bc-8125-392d6a1e5285":"IN1011","312c471a-6915-40a2-bb2a-6298c42ae22c":"IN1011A","edd21f55-5e32-4ca3-b837-ab61d0577572":"IN1020","0533b2a9-414c-4b7b-b699-4930d1d2f1ae":"IN1121","01255f7d-4243-4cb6-abfd-9569bbfe6f67":"IN1122","472eb112-4d5b-44c8-8751-4cae526a5454":"IN2100","2cd8377c-d26a-4882-a330-433360361769":"IN2120","6cba8c8b-476d-4167-9001-6b6ca1ea6213":"IN2220","bd936576-d3ce-4da1-940b-88ece36fd6f0":"IN2310","cd140128-87c6-4aad-be17-7514f14f6597":"IN2310A","5303a3ca-f253-41a6-8f04-bab88e3774c8":"IN2310B","9291f8fb-73c0-4cbe-a958-4f4f8c07ad51":"IN2310C","36c17060-0ad8-4fa1-921e-fe32c34fed98":"IN2320","c23cbf40-2379-4bb8-8b61-59c86cd05497":"IN2320A","82fc2f3e-9cb9-47ae-8748-c72564c5073c":"IN2330","f9bd24c3-fc2e-48c1-a5d2-c45f21dd6444":"IN2340","598d6222-0f02-4c8d-9e25-d497ce6cebba":"IN2510","d6a697a4-55a6-46ca-a764-7481f2eb93ec":"IN2511","5da8bbdb-9b0c-4e53-8bc9-32b0173d4dff":"IN2512","043acdd1-3fae-4c70-939c-fe7ca570cb87":"IN2513","9f2be346-0494-4b66-a5de-fb5c70a1f878":"IN2514","b7c1b2a6-c018-4c8a-9046-8d05db2d4b18":"IN2515","9cc50f99-3ecb-11ea-8017-02437075395e":"IN2520","682633a1-33d2-4342-a965-8cd80f07b515":"IN2530","85d0ee98-c9af-42c9-8959-c81a9a3e5080":"IN2810","d87fbbea-8bcc-46e4-98b9-6655c729ceab":"IN2810A","8658a05d-378d-44f1-a4c3-edec716339c1":"IN2810B","53b6f8d4-5bc2-4ca4-90b2-a455449e0826":"IN2820","fdd58745-c866-437c-9263-451b35294d19":"IN2820A","b5034dc5-bd00-4382-91f5-4f7b7905c7f1":"IN2820B","f4adea15-cd9d-4b34-be4d-608ffd73c8f9":"IN2820C","ac62923d-7d74-40c2-9d8d-ac23e67b82b3":"IN4107","a6bbc851-7eb1-45d6-825d-1d5b6250f92f":"IN4108","dc44da0f-097a-4ab6-9d1f-2c14efb410b3":"IN4109","9cc512a7-3ecb-11ea-8017-02437075395e":"IN4110","f13bbb5e-185e-4ca0-96ce-7c74f09854d9":"IN4111","2eb1b3c6-3601-44c9-aad0-40c59f5a1747":"IN4112","3e3f0b79-190c-415d-b4b3-8a0af17a903b":"IN4112A","c1bd3bc9-4af9-426f-97c1-0b713dc1633c":"IN4112B","2ef3470f-116d-437d-9e7d-9ec33d324238":"IN4113","0b440cee-c22f-43a8-be27-8cda7b05a990":"IN4114","7f83b4dc-624d-4081-9fd3-960bd5f26a62":"IN4114A","7631ffca-b9ab-44a7-b382-dee1ccf76e28":"IN4114B","577ca07c-193f-40b6-9215-ea7a782e9212":"IN4115","b7821838-cf83-4d9f-bc5c-9482ea0c053c":"IN4116","ca273143-8395-43db-81ce-76f0697b756e":"IN4117","cc4a2370-69b9-4037-836b-170c3150fbf7":"IN4118","904ecf10-dc2b-48f8-8516-05bbdbd55c8d":"IN4118A","e6dd70a2-1c61-4201-a3e3-2b2251f8e076":"IN4119","ecfa28f3-e8cb-48e4-b88f-782627762d31":"IN4120","1ca668d5-5b28-4586-a379-4b9f6ead429a":"IN4121","65bbacc1-2fcb-4c17-b95f-02d2a95f0b0d":"IN4121A","74976882-a958-4001-ba02-1594786669de":"IN4122","6124fea9-e231-4982-b6bf-4f8cb1d48061":"IN4122A","ddb2a4c0-4625-402f-8918-98ebc19e3ef9":"IN4123","96281b3b-4824-4c09-9e8a-13ec5d920707":"IN4124","64fda8cc-cacf-4ab1-b033-b89ca09338df":"IN4210","7e40176d-2ad5-4b94-a154-a510f5f6c13c":"IN4211","dd48d18c-3df1-433a-956b-9ca9145915a2":"IN4220","1a1860bf-864e-4e08-83c2-8c6da5298fa6":"IN4221","3c1ca721-7e6b-42a2-a991-79d888f46d3e":"IN4222","ec6b7803-498a-411c-afb1-a32e323192e5":"IN4225","676e56eb-d7f1-4c8b-81dd-303e72a781c6":"IN4230","ee5ffe5a-d137-4cf0-a30f-a50179d6e636":"IN4301","ae9d582e-b36e-4c75-93d3-e8c20ebbffdb":"IN4301A","b6453dbe-d4f0-4b0b-893e-ce17c2941c70":"IN4302","87cd1f0a-8cc6-45a8-8d0c-3e4595e53416":"IN4302A","0713bbf9-a31f-4911-bac8-520c82f814e5":"IN4303","1650a1b0-e4bf-4a8f-b840-9fde5b63a202":"IN4303A","e3f52072-8882-4ef2-9b19-3feb040dbeda":"IN4304","be54a433-876e-4020-8dd7-0f42143dfaef":"IN4304A","703ff0d0-67ac-4d47-9a4c-314f6a2eda2c":"IN4305","5eb5484c-36d4-4997-ba33-c3905b9dbc37":"IN4305A","9aeb15ed-c982-4095-8ba7-d0a841b093cb":"IN4306","caa2f327-ad00-47c8-9eb4-1adf03ee07fe":"IN4306A","1cec22ef-3713-4940-85c5-0f610be48a0f":"IN4307","a9f510e4-3a66-4279-be36-48a4f63183f3":"IN4308","633bdcff-01a9-4362-9fdf-eccc47e9e1f5":"IN4308A","c7f82323-aee5-48e4-ac53-639241594abd":"IN4309","48e985f6-3f4f-4a92-b229-cac0c6e8b86e":"IN4310","d392a36e-b893-476d-a090-11a180a6be07":"IN4311","79e73708-7baa-4a97-9096-bb17c4345dc6":"IN4312","c5dfc0b8-fbe4-4cb0-a00a-c0170c3fba50":"IN4313","00c7282e-d2fc-4e7f-8f16-7ea32d582975":"IN4314","712529d8-9527-4ba6-8461-cd6adad8890b":"IN4315","b859338e-b7b4-4613-9463-4fe8fcdd9bcf":"IN4316","223d6130-0393-431e-bb5f-6d55e2372804":"IN4317","54dc5ef8-274c-4b2f-b3f1-41ec174cdae5":"IN4318","6f5ad709-cde0-4ca3-b7df-7fc3c0b1a099":"IN4319","32237ee2-288e-4577-b38a-2b9868534c99":"IN4320","9cc51dd4-3ecb-11ea-8017-02437075395e":"IN4330","983b3b25-8a77-4db1-bdb9-ae8d6474216f":"IN4331","852c456e-c71e-48e5-9b8b-31d761afc11c":"IN4332","65949ade-ace5-44f8-9d84-a0519fa63309":"IN4335","2ce33977-fc19-4fab-b580-f92200d12e0e":"IN4338","9cc51727-3ecb-11ea-8017-02437075395e":"IN4340","731c7322-876d-48cb-aded-369dee74996f":"IN4341","233cb514-b995-4e1f-bbc2-e229ea7e11f5":"IN4342","794631db-962f-45eb-96d5-98bc6bf0ca04":"IN4343","fe53d4f3-cc4d-46f0-a414-8446ec634994":"IN4344","5935fa29-8a40-402c-88d8-c88f275b14d7":"IN4352","36c31e69-2694-42f6-a5ce-6a29373737de":"IN4410","7651465b-c42f-4bca-82a3-c78e08e1a5f0":"IN4411","093da6cb-7d78-4d4d-931e-119cac4c2c9e":"IN4412","f6e1dea9-78f8-4a55-bea2-932325fac8fc":"IN4413","c0a96a28-ab97-48ad-9b5e-2eb8806eae39":"IN4414","d8ac7c03-b2f5-4e68-9579-5a8aa2a4d4b1":"IN4415","fa612f41-6f0c-4459-92e8-6b8a6f27b42b":"IN4416","907a0df7-1080-4747-b35a-bf2b72887c9b":"IN4420","5c133168-991b-40ce-bc40-7a8332580dc6":"IN4430","e810feb0-6485-4f95-a858-6ecc1d4ec8d5":"IN4431","90d5ce1c-cbc6-4213-992b-b1f38e1e0640":"IN4450","207fc2cf-333e-4ab4-ac95-22a303029990":"IN4451","d79ad666-2692-47cb-b734-76bbb9e03b94":"IN4520","57dbb155-e056-4b38-836c-6e6a904dbb55":"IN4521","b0e308e8-8f8c-4c90-b216-5a10dd8f52be":"IN4530","f2837286-ed58-4e11-bb47-d7cb67d3d254":"IN4540","0abf4cdf-0be5-481a-9760-c6a2dfc2dd22":"IN4541","02693259-1c91-43a7-8395-ff783c50891b":"IN4580","d5ba3ca8-dfb1-451c-a0c1-0b047dd5f54e":"IN4581","9cc52bcb-3ecb-11ea-8017-02437075395e":"IN4610","6bb82799-b557-4258-8b07-0ac8c8172743":"IN4610A","9ec1f7c1-5500-436f-8490-71d63b520457":"IN4710","7bc3da9e-4c48-4546-a5fc-33621d759268":"IN4710A","9cc46d6b-3ecb-11ea-8017-02437075395e":"IN4720","81b8291d-f497-47b5-a32b-9676866a1a91":"IN5111","427f70ba-9eeb-4240-88a4-41b0652a7d66":"IN5112","762d1155-436f-493f-9824-a1c9a4f5aeea":"IN5113","f2ad7617-742d-4985-82da-e0391d199766":"IN5113A","82bc8eda-4bd3-4917-bd14-50d0e8911de7":"IN5114","4c38fb87-f1ef-4b15-a53e-74ded21207b9":"IN5116","9cc48ca0-3ecb-11ea-8017-02437075395e":"IN5120","0b6675aa-2470-4344-ae9e-b79d52b2948a":"IN5124","ea750f2b-86a9-4068-bed5-813f5d96eb64":"IN5125","d3ab98ce-00cd-4273-9eb4-68004a81f285":"IN5126","61a89391-d490-4c14-8f12-7a787b1b4369":"IN5127","9dc0151a-4988-4322-8423-1bc2dfeba3e4":"IN5128","0a8f18ca-a0a2-4644-9690-4a744d91c2d1":"IN5129","9cc521ac-3ecb-11ea-8017-02437075395e":"IN5130","6d190aa0-f6ad-41d5-a580-551005218d86":"IN5131","be632e35-bcbf-4927-afbd-c09c61a8baf7":"IN5132","89336d7b-a742-4f34-a5fc-231595e68ed5":"IN5133","e2ac9b4c-d0ea-4458-b4e5-23317608436d":"IN5133A","987be449-eb37-4a85-81b5-b1d714903cb2":"IN5134","6b776a05-4fb5-4a18-af15-7b3e5f12ecb0":"IN5135","1bbe5e44-b74c-4152-9909-4642051906ea":"IN5136","d8bb3596-7324-40dd-a5f8-36209d6a9daa":"IN5136A","001db47f-cc22-4fda-aa11-c14c3e4942f0":"IN5136B","442d26cf-99c4-464f-81fd-43a758c535cc":"IN5137","a0b9de22-dd7c-4df5-a608-977f9e121267":"IN5138","064d69ff-3d4a-4377-8e0a-4568876a7ad0":"IN5139","9cc520c4-3ecb-11ea-8017-02437075395e":"IN5140","e3bbff44-9e76-4428-a643-074cdeec5bb4":"IN5141","e66f5af4-d1b5-4e03-a910-8ed5bd10cd4c":"IN5142","a902bd44-8fc1-4e45-a40f-df0e553e22de":"IN5143","d87ec409-be71-44d7-a25f-9a42e092b423":"IN5144","0f74b146-d100-4cec-94b0-c04d223fecb2":"IN5144A","1249bc0e-84f3-4ba3-aa00-ce4cde748cb5":"IN5210","32335923-1316-4698-9fae-8c7b5aa31650":"IN5211","5a48da56-06da-41c4-b617-f52b3e3b882e":"IN5212","54298455-2a47-43c9-9c2d-10a857625d8b":"IN5213","0f3258fb-05fa-4c7b-9bd0-41cb1a77f58e":"IN5214","9cf92883-64a9-43d8-b49c-6f1e34427c45":"IN5215","9cc51436-3ecb-11ea-8017-02437075395e":"IN5216","03a11d52-135d-4409-aafe-a5c6663497b4":"IN5217","35264b93-210b-4f5c-a495-aeb62d3bc64d":"IN5218","b783336d-488a-4f08-a2c0-c20f1b5d38fc":"IN5220","10a8e2b7-4ed8-490a-a051-31301c2a56f2":"IN5221","15076c53-ef6c-458d-ae61-ca014786a32c":"IN5222","1529b6fe-6267-44d2-a2ba-c768d966e61e":"IN5229","8c35113f-0797-4d62-9527-b6c786d43b99":"IN5230","eb443c86-d7e8-4899-9fc8-da71d925399e":"IN5270","1cf5b768-e72b-418d-b5a4-d763c7539cc2":"IN5310","1bae0d7e-b139-4c75-8727-cc6c5b2d8d69":"IN5311","9cc5480b-3ecb-11ea-8017-02437075395e":"IN5320","2982ed18-3a48-4aa0-bb27-1351192a825b":"IN5321","98033658-877c-4871-8551-2d18581101e8":"IN5322","832db26f-d11c-4fc9-b223-77bc8478a648":"IN5323","2b48dade-e29f-43f5-a606-583f6112e9b0":"IN5324","aa5c4f07-c56a-4242-91a8-e68fc1cbadb5":"IN5325","27f23e53-8a13-44a8-a637-07d94ca2e126":"IN5328","d5874429-f79b-433d-b290-66717331b5e9":"IN5335","c9b3795f-5a4f-4f9b-a8fe-aae244df5610":"IN5336","25f0d228-a9ae-431a-8cc1-5241e0f52082":"IN5340","096ee21b-b463-4a0e-9b73-7a8f9e88957e":"IN5340A","da65e851-42fc-4fae-8b0a-87eec4d42f22":"IN5341","040d87e2-ae93-4e6f-8a72-3b1c93baeaac":"IN5342","0651dc83-01f7-472b-ad4a-afcb8394d734":"IN5410","8472951e-6fc2-447d-b9ff-2a413be75df3":"IN5411","8ce9eda7-2c38-4104-8656-4e350e361e5a":"IN5510","dc9cdf10-58e9-47e0-8ced-783a7e1bf07d":"IN5530","f5d1dad4-587b-4bd1-8d33-1f52574c9591":"IN5536","a835c85a-38be-408b-bfe7-5b8a8fec1e03":"IN5540","30986d98-e522-4b27-9984-67bce5080b74":"IN5710","d5683ca6-f02b-4a61-8453-3e04119ba480":"IN5910","33bb4dc1-eff9-49ee-a031-4828e4c8ff44":"IN5911","3fd4d20b-3859-472d-b4a2-0fdb77faf9b4":"INTEST","5d1b0dba-fce9-4760-86bd-3d6d449d4ff5":"INTFLIX","06a48016-cd18-4fcc-a046-fae48781ac81":"INTTEST_2"};

// Maps FlixBus Line UUID -> hardcoded total seat count (from master_india_lines.csv)
const LINE_SEAT_MAP = {"b496b789-c346-4334-b548-395646d9d6ee":45,"95572923-ef71-4cf3-8ac7-77104851b017":36,"592aa978-56af-4a3c-98bd-3451653d91b0":36,"db480497-d8fd-4f0f-835a-163875d40459":48,"69096e6f-56c7-4b5a-857c-d9670f8d852f":48,"ec18d028-29b3-413a-a15a-7efa504ad5f3":48,"757bf869-56c7-46b2-939b-71ba3759a7e7":48,"317a9a51-0de6-4b73-921e-dae6334f916b":45,"84dfe4fa-9623-4cf7-a21c-268b8eeaf71a":45,"75d99d81-e5d9-4428-b4c2-823720dc2095":45,"23750bb4-cc6b-461e-ab14-21c636f7b70d":45,"89567f53-2da1-4b1b-baaf-aefbdcda5ee1":45,"b0331778-942d-478c-b751-cac180ce1d7a":45,"aded58fd-bb0c-45e3-b6cd-51638968ff3d":49,"130d0b12-f2b0-4783-8005-8573ca680346":49,"22a4a751-d72a-416f-a480-2c803b0f8401":45,"3c7c4278-dcef-43db-92c1-3a55b0f87eed":45,"0cb111c4-0e4f-4fc9-9918-32caa6576a6d":45,"72c51962-5e58-492a-921e-7cdd68f161d5":49,"218453a2-cc03-44d1-8840-cbdb60c8e079":45,"2a69f65d-f9b2-4ad4-b657-948d554c37de":36,"bfe5b1e4-bff3-4715-8b73-5de6ff98cf77":48,"92e62b01-1052-44a2-9810-9f93add164e3":49,"77223855-3b4e-4242-9ffe-1a0d1d9f566f":36,"fe17591f-fbfc-4479-9897-203d362471ef":48,"24c49b22-fcc9-4e97-909e-37308c3c0530":48,"7f953dcc-3610-4d4b-b993-3c046f643c8b":48,"4b619c49-8ed6-4fbd-981d-3486091b5110":48,"ae2c281e-85ac-4c0e-8649-41ee6b48a3ef":49,"268abe54-c1f5-41cb-885a-ce999a05a1cc":36,"0c672a51-e005-427b-947b-a39f738a747c":45,"e24197e0-2dbf-43e2-9c61-76c819360b8a":36,"288732f9-52e4-445e-9112-3629ecb95fbf":48,"e1fa0e0a-a170-4ed5-b95f-b7f88f252f46":45,"462461db-7aa9-4130-b372-af49e7e8d823":45,"36e3fc1c-60da-496a-a8fc-b0bf8defb983":36,"4568ed20-be7c-4375-ac36-d901b4315de3":48,"fefdb46f-92d0-4c89-bde6-98ea092e3af5":48,"0392d8fe-1749-48c7-88d0-c2212c937cdf":36,"7d4b75c9-a36d-4962-b8c3-a6908c38e6f1":36,"d05ef689-3f28-48a7-804f-f3e464e22d4b":48,"63f58157-1a22-4c5b-abdf-1da503de7a97":36,"cff5094d-9672-4705-8b45-775f29c0b22b":36,"7e5794e8-2c6c-418c-97b5-35a6654e54f7":36,"efbe9628-2fe0-4a4c-9b79-d978153620d4":45,"a2e1e9bc-c373-4b5a-937c-ce069a1c03be":22,"29ab8429-4444-454f-bd00-d9e4cd94679c":36,"556f243e-bdde-4a9a-83b0-83f96fafd1d0":36,"04970adb-b0e6-4357-8618-50767d2a42e3":45,"efba0533-009b-4f9a-b150-33955802adf0":48,"ebd82b99-ae5d-4b2b-8008-df65c71bedca":36,"9958d1ef-7216-43f2-b19c-4a0dfb81fd08":36,"3c8926ab-e467-47bc-8125-392d6a1e5285":36,"472eb112-4d5b-44c8-8751-4cae526a5454":36,"2cd8377c-d26a-4882-a330-433360361769":48,"bd936576-d3ce-4da1-940b-88ece36fd6f0":36,"cd140128-87c6-4aad-be17-7514f14f6597":48,"5303a3ca-f253-41a6-8f04-bab88e3774c8":36,"36c17060-0ad8-4fa1-921e-fe32c34fed98":36,"598d6222-0f02-4c8d-9e25-d497ce6cebba":36,"d6a697a4-55a6-46ca-a764-7481f2eb93ec":36,"5da8bbdb-9b0c-4e53-8bc9-32b0173d4dff":36,"043acdd1-3fae-4c70-939c-fe7ca570cb87":48,"682633a1-33d2-4342-a965-8cd80f07b515":36,"85d0ee98-c9af-42c9-8959-c81a9a3e5080":36,"53b6f8d4-5bc2-4ca4-90b2-a455449e0826":48,"fdd58745-c866-437c-9263-451b35294d19":36,"a6bbc851-7eb1-45d6-825d-1d5b6250f92f":36,"dc44da0f-097a-4ab6-9d1f-2c14efb410b3":48,"9cc512a7-3ecb-11ea-8017-02437075395e":36,"f13bbb5e-185e-4ca0-96ce-7c74f09854d9":36,"2eb1b3c6-3601-44c9-aad0-40c59f5a1747":48,"0b440cee-c22f-43a8-be27-8cda7b05a990":48,"577ca07c-193f-40b6-9215-ea7a782e9212":36,"b7821838-cf83-4d9f-bc5c-9482ea0c053c":36,"ca273143-8395-43db-81ce-76f0697b756e":48,"cc4a2370-69b9-4037-836b-170c3150fbf7":36,"e6dd70a2-1c61-4201-a3e3-2b2251f8e076":36,"64fda8cc-cacf-4ab1-b033-b89ca09338df":36,"dd48d18c-3df1-433a-956b-9ca9145915a2":36,"1a1860bf-864e-4e08-83c2-8c6da5298fa6":36,"3c1ca721-7e6b-42a2-a991-79d888f46d3e":48,"ec6b7803-498a-411c-afb1-a32e323192e5":36,"676e56eb-d7f1-4c8b-81dd-303e72a781c6":36,"703ff0d0-67ac-4d47-9a4c-314f6a2eda2c":36,"a9f510e4-3a66-4279-be36-48a4f63183f3":48,"c7f82323-aee5-48e4-ac53-639241594abd":48,"48e985f6-3f4f-4a92-b229-cac0c6e8b86e":36,"d392a36e-b893-476d-a090-11a180a6be07":36,"79e73708-7baa-4a97-9096-bb17c4345dc6":36,"c5dfc0b8-fbe4-4cb0-a00a-c0170c3fba50":36,"00c7282e-d2fc-4e7f-8f16-7ea32d582975":36,"712529d8-9527-4ba6-8461-cd6adad8890b":48,"b859338e-b7b4-4613-9463-4fe8fcdd9bcf":36,"223d6130-0393-431e-bb5f-6d55e2372804":36,"54dc5ef8-274c-4b2f-b3f1-41ec174cdae5":36,"6f5ad709-cde0-4ca3-b7df-7fc3c0b1a099":36,"32237ee2-288e-4577-b38a-2b9868534c99":48,"9cc51dd4-3ecb-11ea-8017-02437075395e":36,"852c456e-c71e-48e5-9b8b-31d761afc11c":36,"65949ade-ace5-44f8-9d84-a0519fa63309":36,"2ce33977-fc19-4fab-b580-f92200d12e0e":36,"9cc51727-3ecb-11ea-8017-02437075395e":36,"731c7322-876d-48cb-aded-369dee74996f":36,"5935fa29-8a40-402c-88d8-c88f275b14d7":36,"7651465b-c42f-4bca-82a3-c78e08e1a5f0":36,"093da6cb-7d78-4d4d-931e-119cac4c2c9e":36,"907a0df7-1080-4747-b35a-bf2b72887c9b":36,"5c133168-991b-40ce-bc40-7a8332580dc6":36,"90d5ce1c-cbc6-4213-992b-b1f38e1e0640":36,"d79ad666-2692-47cb-b734-76bbb9e03b94":36,"f2837286-ed58-4e11-bb47-d7cb67d3d254":36,"02693259-1c91-43a7-8395-ff783c50891b":36,"9cc52bcb-3ecb-11ea-8017-02437075395e":36,"9ec1f7c1-5500-436f-8490-71d63b520457":36,"7bc3da9e-4c48-4546-a5fc-33621d759268":36,"81b8291d-f497-47b5-a32b-9676866a1a91":36,"427f70ba-9eeb-4240-88a4-41b0652a7d66":36,"762d1155-436f-493f-9824-a1c9a4f5aeea":48,"f2ad7617-742d-4985-82da-e0391d199766":36,"4c38fb87-f1ef-4b15-a53e-74ded21207b9":36,"9cc48ca0-3ecb-11ea-8017-02437075395e":45,"d3ab98ce-00cd-4273-9eb4-68004a81f285":48,"61a89391-d490-4c14-8f12-7a787b1b4369":48,"0a8f18ca-a0a2-4644-9690-4a744d91c2d1":36,"9cc521ac-3ecb-11ea-8017-02437075395e":36,"6d190aa0-f6ad-41d5-a580-551005218d86":36,"1bbe5e44-b74c-4152-9909-4642051906ea":36,"442d26cf-99c4-464f-81fd-43a758c535cc":36,"a0b9de22-dd7c-4df5-a608-977f9e121267":36,"064d69ff-3d4a-4377-8e0a-4568876a7ad0":36,"9cc520c4-3ecb-11ea-8017-02437075395e":36,"e3bbff44-9e76-4428-a643-074cdeec5bb4":36,"a902bd44-8fc1-4e45-a40f-df0e553e22de":36,"1249bc0e-84f3-4ba3-aa00-ce4cde748cb5":36,"32335923-1316-4698-9fae-8c7b5aa31650":36,"5a48da56-06da-41c4-b617-f52b3e3b882e":36,"54298455-2a47-43c9-9c2d-10a857625d8b":48,"0f3258fb-05fa-4c7b-9bd0-41cb1a77f58e":48,"9cf92883-64a9-43d8-b49c-6f1e34427c45":36,"9cc51436-3ecb-11ea-8017-02437075395e":36,"03a11d52-135d-4409-aafe-a5c6663497b4":36,"b783336d-488a-4f08-a2c0-c20f1b5d38fc":36,"10a8e2b7-4ed8-490a-a051-31301c2a56f2":48,"1529b6fe-6267-44d2-a2ba-c768d966e61e":36,"8c35113f-0797-4d62-9527-b6c786d43b99":36,"eb443c86-d7e8-4899-9fc8-da71d925399e":36,"1cf5b768-e72b-418d-b5a4-d763c7539cc2":49,"9cc5480b-3ecb-11ea-8017-02437075395e":36,"98033658-877c-4871-8551-2d18581101e8":48,"832db26f-d11c-4fc9-b223-77bc8478a648":48,"2b48dade-e29f-43f5-a606-583f6112e9b0":48,"aa5c4f07-c56a-4242-91a8-e68fc1cbadb5":36,"27f23e53-8a13-44a8-a637-07d94ca2e126":36,"d5874429-f79b-433d-b290-66717331b5e9":36,"c9b3795f-5a4f-4f9b-a8fe-aae244df5610":48,"25f0d228-a9ae-431a-8cc1-5241e0f52082":36,"096ee21b-b463-4a0e-9b73-7a8f9e88957e":36,"0651dc83-01f7-472b-ad4a-afcb8394d734":45,"8ce9eda7-2c38-4104-8656-4e350e361e5a":36,"dc9cdf10-58e9-47e0-8ced-783a7e1bf07d":36,"f5d1dad4-587b-4bd1-8d33-1f52574c9591":36,"d5683ca6-f02b-4a61-8453-3e04119ba480":36};

// INR→EUR: 1 EUR ≈ 112.36 INR (Google Finance, Aug 2026)
const INR_PER_EUR = 112.36;

// City name aliases: extension city name → Excel city name (for distance lookup)
const CITY_DISTANCE_ALIAS = {
  "Alapuzha": "Alappuzha",
  "Rameswaram  ": "Rameswaram",
  "Bodi": "Bodinayakanur",
};

// Road distances (km) between city pairs, sourced from City_Pair_Road_Distances.xlsx
const DISTANCE_MAP = {
  "Bengaluru|Alappuzha":593,"Alappuzha|Bengaluru":593,
  "Bengaluru|Chennai":346,"Chennai|Bengaluru":346,
  "Bengaluru|Coimbatore":366,"Coimbatore|Bengaluru":366,
  "Bengaluru|Hyderabad":567,"Hyderabad|Bengaluru":567,
  "Bengaluru|Kochi":547,"Kochi|Bengaluru":547,
  "Bengaluru|Madurai":434,"Madurai|Bengaluru":434,
  "Bengaluru|Nagercoil":661,"Nagercoil|Bengaluru":661,
  "Bengaluru|Ongole":510,"Ongole|Bengaluru":510,
  "Bengaluru|Pondicherry":311,"Pondicherry|Bengaluru":311,
  "Bengaluru|Rajahmundry":800,"Rajahmundry|Bengaluru":800,
  "Bengaluru|Thiruvalla":618,"Thiruvalla|Bengaluru":618,
  "Bengaluru|Tiruchendur":614,"Tiruchendur|Bengaluru":614,
  "Bengaluru|Tirunelveli":581,"Tirunelveli|Bengaluru":581,
  "Bengaluru|Trivandrum":728,"Trivandrum|Bengaluru":728,
  "Bengaluru|Velankanni":484,"Velankanni|Bengaluru":484,
  "Bengaluru|Vijayawada":650,"Vijayawada|Bengaluru":650,
  "Bengaluru|Visakhapatnam":990,"Visakhapatnam|Bengaluru":990,
  "Chennai|Coimbatore":510,"Coimbatore|Chennai":510,
  "Chennai|Cumbum":546,"Cumbum|Chennai":546,
  "Chennai|Hyderabad":627,"Hyderabad|Chennai":627,
  "Chennai|Kochi":690,"Kochi|Chennai":690,
  "Chennai|Madurai":462,"Madurai|Chennai":462,
  "Chennai|Munnar":589,"Munnar|Chennai":589,
  "Chennai|Bodinayakanur":522,"Bodinayakanur|Chennai":522,
  "Chennai|Nagercoil":704,"Nagercoil|Chennai":704,
  "Chennai|Pollachi":537,"Pollachi|Chennai":537,
  "Chennai|Pondicherry":155,"Pondicherry|Chennai":155,
  "Chennai|Rameswaram":559,"Rameswaram|Chennai":559,
  "Chennai|Tiruchendur":639,"Tiruchendur|Chennai":639,
  "Chennai|Tiruchirapalli":330,"Tiruchirapalli|Chennai":330,
  "Chennai|Tirunelveli":624,"Tirunelveli|Chennai":624,
  "Chennai|Udankudi":650,"Udankudi|Chennai":650,
  "Chennai|Vijayawada":453,"Vijayawada|Chennai":453,
  "Chennai|Visakhapatnam":799,"Visakhapatnam|Chennai":799,
  "Coimbatore|Vijayawada":951,"Vijayawada|Coimbatore":951,
  "Hyderabad|Goa":658,"Goa|Hyderabad":658,
  "Hyderabad|Kakinada":484,"Kakinada|Hyderabad":484,
  "Hyderabad|Nellore":453,"Nellore|Hyderabad":453,
  "Hyderabad|Pondicherry":784,"Pondicherry|Hyderabad":784,
  "Hyderabad|Tirupati":562,"Tirupati|Hyderabad":562,
  "Hyderabad|Vijayawada":272,"Vijayawada|Hyderabad":272,
  "Hyderabad|Visakhapatnam":619,"Visakhapatnam|Hyderabad":619,
  "Hyderabad|Vizianagaram":668,"Vizianagaram|Hyderabad":668,
  "Vijayawada|Visakhapatnam":347,"Visakhapatnam|Vijayawada":347,
};

function normalizeDistanceCity(name) {
  const trimmed = (name || "").trim();
  return CITY_DISTANCE_ALIAS[trimmed] || trimmed;
}

function getRouteDistance(fromCity, toCity) {
  const a = normalizeDistanceCity(fromCity);
  const b = normalizeDistanceCity(toCity);
  return DISTANCE_MAP[`${a}|${b}`] ?? DISTANCE_MAP[`${b}|${a}`] ?? null;
}

// Look up line code for a FlixBus service using the first 36 chars of serviceId as the Line UUID
// Returns line code string, or "NA" if not found
function lookupLineCode(serviceId) {
  if (!serviceId) return "NA";
  const uuid = serviceId.substring(0, 36);
  return LINE_UUID_MAP[uuid] || "NA";
}

// Look up hardcoded total seats for a FlixBus service from master_india_lines.csv
// Returns seat count number, or null if UUID not found (fall back to API value)
function lookupHardcodedSeats(serviceId) {
  if (!serviceId) return null;
  const uuid = serviceId.substring(0, 36);
  return LINE_SEAT_MAP[uuid] ?? null;
}

// Render comparison table with current filter
function renderComparisonTable() {
  const filterValue = document.getElementById("productTypeFilter").value;
  let filteredData = filterByBusType(allComparisonData, filterValue);

  const fromCityName = document.getElementById("fromCity").selectedOptions[0]?.text || "";
  const toCityName = document.getElementById("toCity").selectedOptions[0]?.text || "";
  const routeDistance = getRouteDistance(fromCityName, toCityName);

  // Apply Flix + IntrCity focus filter if active
  if (focusFilterActive) {
    filteredData = filteredData.filter(bus => {
      const name = bus.travelsName.toLowerCase();
      return name.includes("flix") || name.includes("intr");
    });
  }

  const tbody = document.querySelector("#comparisonTable tbody");
  tbody.innerHTML = "";

  // Determine if every Flix bus with a known line code is marked D — if so, suppress row highlight
  const flixWithCode = filteredData.filter(bus => {
    if (!bus.travelsName.toLowerCase().includes("flix")) return false;
    const lc = lookupLineCode(bus.serviceId);
    return lc !== "NA" && lc !== "-";
  });
  const allFlixD = flixWithCode.length > 0 && flixWithCode.every(bus => {
    const lc = lookupLineCode(bus.serviceId);
    const product = busProduct(bus.isSeater, bus.isSleeper);
    return ndStatusMap[ndKey(lc, product)] === "D";
  });

  filteredData.forEach(bus => {
    const tr = document.createElement("tr");
    const isFlix = bus.travelsName.toLowerCase().includes("flix");

    if (isFlix) {
      tr.classList.add("flixbus");
      const rank = Number(bus.SRPRank);
      const total = totalInventoryBusCount;
      let rankColor = "#73d700";
      if (total > 0 && !isNaN(rank)) {
        if (rank <= Math.ceil(total * 0.10)) {
          rankColor = "#1a7a00";
        } else if (rank <= Math.ceil(total * 0.20)) {
          rankColor = "#73d700";
        } else if (rank > Math.floor(total * 0.75)) {
          rankColor = "#d9534f";
        } else {
          rankColor = "#f0ad4e";
        }
      }
      tr.style.borderLeft = `4px solid ${rankColor}`;
    }

    const lineCode = isFlix
      ? lookupLineCode(bus.serviceId)
      : "-";

    // For Flix buses with a single fareList entry, avg and highest are shown as red NA
    const redNA = `<span style="color:red;font-weight:600;">NA</span>`;
    const avgDisplay    = bus.singleFareList ? redNA : bus.AveragePrice;
    const highestDisplay = bus.singleFareList ? redNA : bus.HighestPrice;

    // Blue dot prefix for Volvo buses
    const isVolvo = (bus.busType || "").toLowerCase().includes("volvo");
    const busNameDisplay = isVolvo
      ? `<span style="color:#1a6ecf;font-size:10px;margin-right:4px;" title="Volvo">●</span>${bus.travelsName}`
      : bus.travelsName;

    // ND/D column: dropdown for Flix buses keyed by lineCode|product; dash for others
    let ndCell = `<td>-</td>`;
    let currentNdValue = "";
    if (isFlix && lineCode !== "NA" && lineCode !== "-") {
      const product = busProduct(bus.isSeater, bus.isSleeper);
      const key = ndKey(lineCode, product);
      currentNdValue = ndStatusMap[key] || "";
      ndCell = `<td><select class="nd-select" data-nd-key="${key}">
        <option value="" ${currentNdValue === "" ? "selected" : ""}></option>
        <option value="ND" ${currentNdValue === "ND" ? "selected" : ""}>ND</option>
        <option value="D" ${currentNdValue === "D" ? "selected" : ""}>D</option>
      </select></td>`;
    }

    // Dark green row highlight for D buses — only when not all Flix are D
    if (isFlix && currentNdValue === "D" && !allFlixD) {
      tr.classList.add("flixbus-dedicated");
    }

    // Yellow dot before line code if ND/D not yet set for this Flix bus
    let lineCodeDisplay = lineCode;
    if (isFlix && lineCode !== "NA" && lineCode !== "-") {
      const product = busProduct(bus.isSeater, bus.isSleeper);
      const key = ndKey(lineCode, product);
      if (!ndStatusMap[key]) {
        lineCodeDisplay = `<span style="color:#f0ad4e;font-size:10px;margin-right:3px;" title="ND/D not set">●</span>${lineCode}`;
      }
    }

    tr.innerHTML = `
      <td>${lineCodeDisplay}</td>
      <td>${busNameDisplay}</td>
      <td>${bus.firstBpTime || "NA"}</td>
      <td>${bus.LoadPct}%</td>
      <td>${bus.LowestPrice}</td>
      <td>${avgDisplay}</td>
      <td>${highestDisplay}</td>
      <td>${bus.departureTime}</td>
      <td>${bus.PBH || "NA"}</td>
      <td>${boolToEmoji(bus.isSeater)}</td>
      <td>${boolToEmoji(bus.isSleeper)}</td>
      <td>${bus.SRPRank}</td>
      <td>${bus.pricePoints ?? "NA"}</td>
      <td>${(() => { const r = parseFloat(bus.totalRatings); if (isNaN(r)) return "NA"; if (!isFlix) return `<span style="color:#000;font-weight:600;">${bus.totalRatings}</span>`; const c = r >= 4 ? "#73d700" : r < 3.5 ? "#d9534f" : "#f0ad4e"; return `<span style="color:${c};font-weight:600;">${bus.totalRatings}</span>`; })()}</td>
      <td>${(() => { const p = bus.LowestPrice; if (p === "NA" || p == null || !routeDistance) return "NA"; const y = (p / INR_PER_EUR) / routeDistance * 100; return y.toFixed(2); })()}</td>
      ${ndCell}
    `;

    tbody.appendChild(tr);
  });
}

// Render operator table with current filter
function renderOperatorTable() {
  const filterValue = document.getElementById("productTypeFilter").value;
  const filteredRows = filterByBusType(allRowsData, filterValue);
  
  // Recalculate operator summary based on filtered data
  const operatorSummary = [
    aggregateOperator(filteredRows, "flix", "FlixBus"),
    aggregateOperator(filteredRows, "intr", "IntrCity"),
    aggregateOperator(filteredRows, "zing", "ZingBus"),
    aggregateOperator(filteredRows, "laxmi", "Laxmi Travels")
  ];
  
  const opTbody = document.querySelector("#operatorTable tbody");
  opTbody.innerHTML = "";
  
  // Check if any Flix bus in the current filtered data has a single-element fareList
  const flixHasSingleFare = filteredRows.some(r =>
    r.travelsName.toLowerCase().includes("flix") && r.singleFareList
  );

  operatorSummary.forEach(op => {
    const tr = document.createElement("tr");
    
    if (op.operator === "FlixBus") {
      tr.classList.add("flixbus");
    }

    // Prefix FlixBus name with a red dot if any of its buses have a single-element fareList
    const operatorDisplay = (op.operator === "FlixBus" && flixHasSingleFare)
      ? `<span style="color:red;font-size:10px;margin-right:5px;">●</span>${op.operator}`
      : op.operator;
    
    tr.innerHTML = `
      <td>${operatorDisplay}</td>
      <td>${op.count}</td>
      <td>${op.avgLoad}%</td>
      <td>${op.avgAvg}</td>
      <td>${op.avgLow}</td>
      <td>${op.avgHigh}</td>
      <td>${op.firstDep}</td>
      <td>${op.lastDep}</td>
      <td>${op.minLow}</td>
      <td>${op.maxHigh}</td>
    `;
    
    opTbody.appendChild(tr);
  });
}

// Persist ND/D selection and handle dblclick-to-focus via event delegation on comparison tbody
document.addEventListener("DOMContentLoaded", () => {
  const compTbody = document.querySelector("#comparisonTable tbody");

  compTbody.addEventListener("change", e => {
    if (!e.target.classList.contains("nd-select")) return;
    const key = e.target.dataset.ndKey;
    const value = e.target.value;
    if (value) {
      saveNdStatus(key, value);
    } else {
      delete ndStatusMap[key];
      chrome.storage.local.set({ ndStatusMap });
    }
    // Re-render so the yellow dot appears/disappears immediately
    renderComparisonTable();
  });

  // Dblclick anywhere on a Flix row opens/focuses the ND/D dropdown in that row
  compTbody.addEventListener("dblclick", e => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const select = tr.querySelector(".nd-select");
    if (!select) return;
    select.focus();
    select.size = select.options.length; // expand as a listbox
    select.addEventListener("change", () => { select.size = 1; select.blur(); }, { once: true });
    select.addEventListener("blur",   () => { select.size = 1; },               { once: true });
  });
});

// Load persisted ND/D map before restoring session so dropdowns render correctly
document.addEventListener("DOMContentLoaded", () => {
  loadNdStatusMap();
});

// Add event listeners for filter dropdowns
document.addEventListener("DOMContentLoaded", () => {
  // Single product type filter drives both tables simultaneously
  document.getElementById("productTypeFilter").addEventListener("change", () => {
    renderComparisonTable();
    renderOperatorTable();
    // Save filter state to session
    chrome.storage.local.set({
      productTypeFilterValue: document.getElementById("productTypeFilter").value
    });
  });

  // Arrow buttons cycle through productTypeFilter options
  const filterSelect = document.getElementById("productTypeFilter");
  function stepFilter(direction) {
    const options = filterSelect.options;
    const next = (filterSelect.selectedIndex + direction + options.length) % options.length;
    filterSelect.selectedIndex = next;
    filterSelect.dispatchEvent(new Event("change"));
  }
  document.getElementById("filterPrevBtn").addEventListener("click", () => stepFilter(-1));
  document.getElementById("filterNextBtn").addEventListener("click", () => stepFilter(1));

  // Focus filter button: toggle between Flix+IntrCity only and all buses
  document.getElementById("focusFlixIntrBtn").addEventListener("click", () => {
    focusFilterActive = !focusFilterActive;
    const btn = document.getElementById("focusFlixIntrBtn");
    btn.classList.toggle("active", focusFilterActive);
    renderComparisonTable();
  });
});

// Restore previous session data when popup opens
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(
    ["lastComparison", "lastOperatorSummary", "lastSearchMeta", "fromCity", "toCity", "doj", "allRows", "totalBusCount", "productTypeFilterValue"],
    (data) => {
      // Only restore tables if data exists
      if (!data.lastComparison || !data.allRows) return;

      // Store data globally for filtering
      allComparisonData = data.lastComparison;
      allRowsData = data.allRows;
      totalInventoryBusCount = data.totalBusCount || 0;

      // Show table sections
      document.getElementById("operatorSection").style.display = "flex";
      document.getElementById("operatorTableWrapper").style.display = "block";
      document.getElementById("comparisonSection").style.display = "flex";
      document.getElementById("comparisonTableWrapper").style.display = "block";

      // Restore bus count
      if (data.totalBusCount) {
        document.getElementById("busCount").textContent = `No of buses: ${data.totalBusCount}`;
      }

      // Restore unified filter selection
      if (data.productTypeFilterValue) {
        document.getElementById("productTypeFilter").value = data.productTypeFilterValue;
      }

      // Restore form inputs BEFORE rendering tables (city names needed for line code lookup)
      if (data.fromCity) document.getElementById("fromCity").value = data.fromCity;
      if (data.toCity) document.getElementById("toCity").value = data.toCity;
      if (data.doj) document.getElementById("doj").value = data.doj;

      // Render both tables with restored filter values
      renderComparisonTable();
      renderOperatorTable();
    }
  );
});

// Get references to dropdown elements
const fromSelect = document.getElementById("fromCity");
const toSelect = document.getElementById("toCity");

// Convert boolean to emoji for display
function boolToEmoji(value) {
  if (value === true) return "✅";
  if (value === false) return "❌";
  return "NA";
}

// Reset/Refresh functionality - clear all data and UI
document.getElementById("refreshBtn").addEventListener("click", () => {
  // Clear session data but preserve the persistent ND/D map
  chrome.storage.local.remove([
    "lastComparison", "lastOperatorSummary", "lastSearchMeta",
    "fromCity", "toCity", "doj", "allRows", "totalBusCount", "productTypeFilterValue"
  ]);
  
  // Clear global data
  allComparisonData = [];
  allRowsData = [];
  
  // Clear both tables
  document.querySelector("#comparisonTable tbody").innerHTML = "";
  document.querySelector("#operatorTable tbody").innerHTML = "";
  
  // Hide table sections
  document.getElementById("operatorSection").style.display = "none";
  document.getElementById("operatorTableWrapper").style.display = "none";
  document.getElementById("comparisonSection").style.display = "none";
  document.getElementById("comparisonTableWrapper").style.display = "none";
  
  // Clear bus count
  document.getElementById("busCount").textContent = "";
  
  // Clear last search info
  document.getElementById("lastSearchInfo").textContent = "";
  
  // Reset form to defaults
  document.getElementById("fromCity").value = "";
  document.getElementById("toCity").value = "";
  
  // Reset filter to default
  document.getElementById("productTypeFilter").value = "all";
  
  // Reset date to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  document.getElementById("doj").value = `${yyyy}-${mm}-${dd}`;
});

// Prefill date input with today's date
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  document.getElementById("doj").value = `${yyyy}-${mm}-${dd}`;
});

// Populate city dropdowns with sorted city list
Object.entries(cities)
  .sort((a, b) => a[0].localeCompare(b[0])) // Sort alphabetically by city name
  .forEach(([name, code]) => {
    // Add option to From dropdown
    const optionFrom = document.createElement("option");
    optionFrom.value = code;
    optionFrom.textContent = name;
    fromSelect.appendChild(optionFrom);

    // Add option to To dropdown
    const optionTo = document.createElement("option");
    optionTo.value = code;
    optionTo.textContent = name;
    toSelect.appendChild(optionTo);
  });

// Aggregate operator statistics from bus rows
function aggregateOperator(rows, keyword, label) {
  // Filter rows matching operator keyword
  // Use word boundary regex only for "laxmi" to exclude "mahalaxmi"
  const matches = rows.filter(r => {
    const name = r.travelsName.toLowerCase();
    if (keyword === "laxmi") {
      // Use word boundary regex for exact "laxmi" match only
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(name);
    } else {
      // Use simple includes for other keywords
      return name.includes(keyword);
    }
  });

  // Return NA values if no matches found
  if (matches.length === 0) {
    return {
      operator: label,
      count: 0,
      avgLoad: "NA",
      avgAvg: "NA",
      minLow: "NA",
      avgLow: "NA",
      maxLow: "NA",
      minHigh: "NA",
      avgHigh: "NA",
      maxHigh: "NA",
      firstDep: "NA",
      lastDep: "NA"
    };
  }

  // Helper: filter valid numeric values for a given key
  const valid = (key) =>
    matches.filter(b => b[key] !== "NA").map(b => Number(b[key]));

  // Helper: calculate average of array
  const avg = arr =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : "NA";

  // Helper: get minimum of array
  const min = arr =>
    arr.length ? Math.min(...arr) : "NA";

  // Helper: get maximum of array
  const max = arr =>
    arr.length ? Math.max(...arr) : "NA";

  // Get valid price arrays
  const lowestPrices = valid("LowestPrice");
  const averagePrices = valid("AveragePrice");
  const highestPrices = valid("HighestPrice");

  // Get sorted departure times
  const departures = matches
    .map(b => b.departureTime)
    .filter(t => t !== "NA")
    .sort();

  // Return aggregated operator stats
  return {
    operator: label,
    count: matches.length,
    avgLoad: avg(valid("LoadPct")),
    avgAvg: avg(averagePrices),
    minLow: min(lowestPrices),
    avgLow: avg(lowestPrices),
    maxLow: max(lowestPrices),
    minHigh: min(highestPrices),
    avgHigh: avg(highestPrices),
    maxHigh: max(highestPrices),
    firstDep: departures[0] || "NA",
    lastDep: departures[departures.length - 1] || "NA"
  };
}

// Main fetch and process function (shared by both buttons)
async function fetchAndProcessData(shouldDownload = false) {
  const fromCitySelect = document.getElementById("fromCity");
  const toCitySelect = document.getElementById("toCity");

  const fromCity = fromCitySelect.value; // City code
  const toCity = toCitySelect.value;     // City code

  const fromCityName = fromCitySelect.selectedOptions[0]?.text; // City name
  const toCityName = toCitySelect.selectedOptions[0]?.text;     // City name

  const dojInput = document.getElementById("doj").value;

  // Validate inputs
  if (!fromCity || !toCity || !dojInput) {
    alert("Please enter all fields!");
    return;
  }

  // Initialize RedBus connection if not already done
  if (!redbusConnectionStatus) {
    const initialized = await initializeRedbusConnection();
    if (!initialized) {
      alert("Failed to connect to RedBus. Please try again.");
      return;
    }
  }

  // Convert date to DD-MMM-YYYY format (Redbus API format)
  const dateObj = new Date(dojInput);
  const doj = dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Format date for filename (e.g., 21-Jan-2026)
  const formattedDateForFile = doj.replace(/ /g, "-");

  // Show loading animation in status bar and disable buttons
  const fetchStatusEl = document.getElementById("redbusStatus");
  fetchStatusEl.textContent = "Fetching data...";
  fetchStatusEl.className = "redbus-status loading";
  document.getElementById("compareBtn").disabled = true;
  document.getElementById("downloadBtn").disabled = true;

  // Construct Redbus API URL
  const apiURL = `https://www.redbus.in/rpw/api/searchResults?fromCity=${fromCity}&toCity=${toCity}&DOJ=${doj}&limit=1000&offset=0&meta=true&groupId=0&sectionId=0&sort=0&sortOrder=0&from=initialLoad&getUuid=true&bT=1&clearLMBFilter=undefined`;

  try {
    // Fetch data from Redbus API
    const res = await fetch(apiURL, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appliedFilterCount: 0, onlyShow: [], dt: [], SeaterType: [], AcType: [],
        travelsList: [], amtList: [], bpList: [], dpList: [], CampaignFilter: [],
        at: [], persuasionList: [], bpIdentifier: [], dpIdentifier: [], bcf: [],
        opBusTypeFilterList: [], priceRange: [], RouteIds: [], bpKeys: [], dpKeys: [],
        streaksFilter: [], preRouteFilters: null
      })
    });

    const json = await res.json();
    const data = json.data;

    // Build SRP rank map directly from data.inventories order (source of truth for rank)
    const inventorySRPRank = new Map();
    (data.inventories || []).forEach((bus, idx) => {
      inventorySRPRank.set(bus.serviceId, idx + 1);
    });

    const boostedBuses = (data.metaData?.rdBoostedInv || []).map(b => ({ ...b, _type: "rdBoostedInv" }));
    const inventoryBuses = (data.inventories || []).map(b => ({ ...b, _type: "inventories" }));

    // Combined list for deduplication (boosted first, then inventory)
    const allBusesForRank = [...boostedBuses, ...inventoryBuses];

    // Deduplicate: prefer inventory version over boosted version (keep last seen = inventory wins)
    const seenServiceIds = new Set();
    // First pass: collect all inventory serviceIds
    const inventoryServiceIds = new Set(inventoryBuses.map(b => b.serviceId));

    // Build deduplicated combined list: skip boosted if same serviceId exists in inventory
    const allBuses = allBusesForRank.filter(bus => {
      if (bus._type === "rdBoostedInv" && inventoryServiceIds.has(bus.serviceId)) {
        return false; // Skip boosted duplicate — inventory version will be used
      }
      if (seenServiceIds.has(bus.serviceId)) {
        return false; // Skip true duplicates within same type
      }
      seenServiceIds.add(bus.serviceId);
      return true;
    });

    // Map API response to structured bus data with SRP Rank
    const rows = allBuses.map((bus, index) => {
      // Extract pricing data (prefer discounted prices over fare list)
      const discountedPrices = bus.operatorOfferCampaign?.CmpgList?.[0]?.DiscountedPrices ?? [];
      const fareList = Array.isArray(bus.fareList) ? bus.fareList : [];
      const priceBase = discountedPrices.length ? discountedPrices : fareList;

      // Detect Flix buses with only a single fareList entry — avg & highest are not meaningful
      const isFlix = (bus.travelsName || "").toLowerCase().includes("flix");
      const singleFareList = isFlix && fareList.length === 1;

      // Calculate price statistics
      // For Flix buses with a single fareList entry, suppress average and highest (show NA in CSV & UI)
      const lowest = priceBase.length ? Math.min(...priceBase) : "NA";
      const highest = singleFareList ? "NA" : (priceBase.length ? Math.max(...priceBase) : "NA");
      const calcAverage = singleFareList ? "NA" : (priceBase.length ? Math.round(priceBase.reduce((a, b) => a + b, 0) / priceBase.length) : "NA");
      // Use wtPrice (weighted price from rdBoostInfo) if available and not single-fareList, else fall back to calculated average
      const wtPrice = bus.rdBoostInfo?.wtPrice;
      const average = (!singleFareList && wtPrice != null) ? Math.round(wtPrice) : calcAverage;

      // Calculate load percentage (occupancy)
      // For Flix buses: use hardcoded seat count from master_india_lines.csv; fall back to API value for others
      const availableSeats = bus.availableSeats ?? 0;
      const hardcodedSeats = lookupHardcodedSeats(bus.serviceId);
      const totalSeats = hardcodedSeats !== null ? hardcodedSeats : (bus.totalSeats ?? 0);
      const loadPct = totalSeats ? ((totalSeats - availableSeats) / totalSeats * 100).toFixed(1) : "NA";

      // Format departure time to HH:MM
      let departureTime = "";
      let departureDateTime = null;
      if (bus.departureTime) {
        const d = new Date(bus.departureTime);
        departureTime = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
        departureDateTime = d;
      } else { departureTime = "NA"; }

      // Format first BP time to HH:MM; retain Date object so Flix PBH uses firstBp, not departure
      let firstBpTime = "NA";
      let firstBpDateTime = null;
      if (bus.firstBpTime) {
        const fbp = new Date(bus.firstBpTime);
        firstBpTime = fbp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
        firstBpDateTime = fbp;
      }

      // Calculate PBH:
      // Flix buses  -> time until first boarding point (firstBpDateTime), falling back to departure
      // All others  -> time until departure
      const pbhBaseDateTime = (isFlix && firstBpDateTime) ? firstBpDateTime : departureDateTime;
      let pbh = "NA";
      if (pbhBaseDateTime) {
        const now = new Date();
        const diffMs = pbhBaseDateTime - now;
        
        if (diffMs > 0) {
          const diffMinutes = Math.floor(diffMs / 60000);
          const days = Math.floor(diffMinutes / 1440);
          const hours = Math.floor((diffMinutes % 1440) / 60);
          const minutes = diffMinutes % 60;
          
          if (days > 0) {
            pbh = `${days} day${days > 1 ? 's' : ''} ${hours} hr${hours !== 1 ? 's' : ''}`;
          } else if (hours > 0) {
            pbh = `${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min`;
          } else {
            pbh = `${minutes} min`;
          }
        } else {
          pbh = "Departed";
        }
      }

      // Look up line code for FlixBus services using serviceId UUID
      const lineCode = lookupLineCode(bus.serviceId);

      // Return structured bus object with SRP Rank (index + 1)
      return {
        SRPRank: inventorySRPRank.get(bus.serviceId) ?? "NA", // Position in data.inventories array
        lineCode,                                              // FlixBus line code (e.g. IN0310M), "NA" for non-Flix
        serviceId: bus.serviceId || "", // Raw serviceId for FlixBus line code lookup
        travelsName: bus.travelsName || "NA",
        LowestPrice: lowest,
        AveragePrice: average,
        HighestPrice: highest,
        singleFareList,                                        // true = Flix bus with single fareList entry
        DiscountedPrices: discountedPrices.join("|") || "NA",
        fareList: fareList.join("|") || "NA",
        pricePoints: fareList.length || 0, // Number of fare price points
        LoadPct: loadPct,
        availableSeats,
        totalSeats,
        departureTime,
        firstBpTime,
        PBH: pbh,
        journeyDurationMin: bus.journeyDurationMin || "NA",
        busType: bus.busType || "NA",
        isSeater: !!bus.isSeater,
        isSleeper: !!bus.isSleeper,
        totalRatings: bus.totalRatings ?? "NA",
        numberOfReviews: bus.numberOfReviews ?? "NA", // Number of reviews (same extraction as totalRatings)
        RedbusType: bus._type
      };
    });

    // Sort rows by departure time
    rows.sort((a, b) => {
      if (!a.departureTime || a.departureTime === "NA") return 1;
      if (!b.departureTime || b.departureTime === "NA") return -1;
      return a.departureTime.localeCompare(b.departureTime);
    });

    // Store all rows data globally
    // For UI tables (Aggregated + All Buses), use inventory-only buses
    const inventoryRows = rows.filter(r => r.RedbusType === "inventories");
    allRowsData = inventoryRows;
    totalInventoryBusCount = inventoryRows.length;

    // -------- Download CSV if requested --------
    if (shouldDownload) {
      // Format current time and date for filename
      const now = new Date();
      const timeOfDownload = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
      const dateOfDownload = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
      
      // Format date of journey for filename (e.g., 26jun)
      const dojForFile = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(/ /g, "").toLowerCase();
      
      // Construct filename: dateofjourney_From_to_timeofdownload_dateofdownload
      const filename = `${dojForFile}_${fromCityName}_${toCityName}_${timeOfDownload.replace(":", ".")}_${dateOfDownload.replace(/\//g, "-")}.csv`;
      
      const headers = Object.keys(rows[0]).join(",");
      const body = rows.map(r => Object.values(r).map(v => `"${v}"`).join(",")).join("\n");
      const blobFull = new Blob([headers + "\n" + body], { type: "text/csv" });
      const aFull = document.createElement("a");
      aFull.href = URL.createObjectURL(blobFull);
      aFull.download = filename;
      aFull.click();
    }

    // -------- Build Flix vs competitors comparison (inventory buses only) --------
    const competitorKeywords = ["intr", "zing", "laxmi"];
    let comparison = [];

    // Filter all FlixBus entries from inventory only
    const flixBuses = inventoryRows.filter(r =>
      r.travelsName.toLowerCase().includes("flix")
    );

    // Add FlixBus entries or placeholder
    if (flixBuses.length > 0) {
      comparison.push(...flixBuses);
    } else {
      comparison.push({
        SRPRank: "NA",
        travelsName: "FlixBus",
        LowestPrice: "NA",
        AveragePrice: "NA",
        HighestPrice: "NA",
        availableSeats: "NA",
        totalSeats: "NA",
        LoadPct: "NA",
        departureTime: "NA",
        firstBpTime: "NA",
        PBH: "NA",
        busType: "NA",
        journeyDurationMin: "NA",
        isSeater: "NA",
        isSleeper: "NA"
      });
    }

    // Add competitor buses or placeholders (inventory only)
    competitorKeywords.forEach(keyword => {
      // Use word boundary regex only for "laxmi" to exclude "mahalaxmi"
      let matchingBuses;
      if (keyword === "laxmi") {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        matchingBuses = inventoryRows.filter(r => regex.test(r.travelsName.toLowerCase()));
      } else {
        matchingBuses = inventoryRows.filter(r => r.travelsName.toLowerCase().includes(keyword));
      }
      
      if (matchingBuses.length > 0) comparison.push(...matchingBuses);
      else comparison.push({
        SRPRank: "NA",
        travelsName: keyword, LowestPrice: "NA", AveragePrice: "NA", HighestPrice: "NA",
        availableSeats: "NA", totalSeats: "NA", LoadPct: "NA", departureTime: "NA",
        firstBpTime: "NA", PBH: "NA", busType: "NA", journeyDurationMin: "NA", isSeater: "NA", isSleeper: "NA"
      });
    });

    // Sort comparison by departure time
    comparison.sort((a, b) => {
      if (!a.departureTime || a.departureTime === "NA") return 1;
      if (!b.departureTime || b.departureTime === "NA") return -1;
      return a.departureTime.localeCompare(b.departureTime);
    });

    // Store comparison data globally
    allComparisonData = comparison;

    // -------- Reset filter and render tables --------
    document.getElementById("productTypeFilter").value = "all";
    
    // Show table sections
    document.getElementById("operatorSection").style.display = "flex";
    document.getElementById("operatorTableWrapper").style.display = "block";
    document.getElementById("comparisonSection").style.display = "flex";
    document.getElementById("comparisonTableWrapper").style.display = "block";
    
    renderComparisonTable();
    renderOperatorTable();

    // Update bus count display (total buses in CSV/Excel export - unfiltered)
    const busCountEl = document.getElementById("busCount");
    busCountEl.textContent = `No of buses: ${inventoryRows.length}`;

    // -------- Save session data for persistence --------
    chrome.storage.local.set({
      lastComparison: comparison,
      allRows: inventoryRows,
      totalBusCount: inventoryRows.length,
      productTypeFilterValue: document.getElementById("productTypeFilter").value,
      lastSearchMeta: {
        fromCityName,
        toCityName,
        date: formattedDateForFile
      },
      fromCity: fromCity,
      toCity: toCity,
      doj: dojInput
    });

    // -------- Log results to console --------
    console.log("%c=== Flix vs Competitors ===", "color:green;font-weight:bold;");
    console.table(comparison.map(b => ({
      "SRP Rank": b.SRPRank,
      "Bus Name": b.travelsName,
      "Load %": b.LoadPct,
      "Lowest Price": b.LowestPrice,
      "Average Price": b.AveragePrice,
      "Highest Price": b.HighestPrice,
      "Departure": b.departureTime,
      "Seater": b.isSeater,
      "Sleeper": b.isSleeper
    })));

    // Restore connected status
    fetchStatusEl.textContent = "RedBus Connected ✅";
    fetchStatusEl.className = "redbus-status connected";

  } catch (err) {
    console.error("Error fetching RedBus data:", err);
    fetchStatusEl.textContent = "Fetch Failed ❌";
    fetchStatusEl.className = "redbus-status error";
    alert("Failed to fetch data. Check console for details.");
  } finally {
    // Always re-enable buttons
    document.getElementById("compareBtn").disabled = false;
    document.getElementById("downloadBtn").disabled = false;
  }
}

// Compare button - fetch and display tables (no download)
document.getElementById("compareBtn").addEventListener("click", async () => {
  await fetchAndProcessData(false);
});

// Swap cities button - interchange from/to and immediately fetch
document.getElementById("swapCitiesBtn").addEventListener("click", async () => {
  const fromSelect = document.getElementById("fromCity");
  const toSelect = document.getElementById("toCity");
  const tmp = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = tmp;
  await fetchAndProcessData(false);
});

// Download button - fetch, display tables, and download CSV
document.getElementById("downloadBtn").addEventListener("click", async () => {
  await fetchAndProcessData(true);
});

// Go to RedBus button - open RedBus search URL with current inputs
document.getElementById("goToRedbusBtn").addEventListener("click", () => {
  const fromCitySelect = document.getElementById("fromCity");
  const toCitySelect = document.getElementById("toCity");
  const dojInput = document.getElementById("doj").value;

  const fromCityId = fromCitySelect.value;
  const toCityId = toCitySelect.value;
  const fromCityName = fromCitySelect.selectedOptions[0]?.text;
  const toCityName = toCitySelect.selectedOptions[0]?.text;

  if (!fromCityId || !toCityId || !dojInput) {
    alert("Please select cities and a date first.");
    return;
  }

  // Format date as DD-Mon-YYYY (e.g. 24-Feb-2026)
  const dateObj = new Date(dojInput);
  const formattedDate = dateObj.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }).replace(/ /g, "-");

  // Build slug: "bangalore-to-vijayawada"
  const slug = `${fromCityName.toLowerCase().replace(/\s+/g, "-")}-to-${toCityName.toLowerCase().replace(/\s+/g, "-")}`;

  const url = `https://www.redbus.in/bus-tickets/${slug}?fromCityName=${encodeURIComponent(fromCityName)}&fromCityId=${fromCityId}&srcCountry=undefined&fromCityType=CITY&toCityName=${encodeURIComponent(toCityName)}&toCityId=${toCityId}&destCountry=undefined&toCityType=CITY&onward=${formattedDate}&doj=${formattedDate}&ref=home`;

  chrome.tabs.create({ url });
});

// Export ND/D mapping as CSV
document.getElementById("exportNdBtn").addEventListener("click", () => {
  chrome.storage.local.get("ndStatusMap", data => {
    const map = data.ndStatusMap || {};
    const entries = Object.entries(map);
    if (!entries.length) {
      alert("No ND/D mappings saved yet.");
      return;
    }
    const rows = [["Line Code", "From City Code", "To City Code", "Bus Product", "ND/D"]];
    entries.forEach(([key, value]) => {
      const [lineCode, product] = key.split("|");
      rows.push([lineCode, "-", "-", product, value]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nd_d_mapping.csv";
    a.click();
  });
});

// Today button - set date to today and re-fetch
document.getElementById("todayBtn").addEventListener("click", async () => {
  const dojEl = document.getElementById("doj");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  dojEl.value = `${yyyy}-${mm}-${dd}`;
  await fetchAndProcessData(false);
});

// Next-day button - advance date by 1 day and re-fetch
document.getElementById("nextDayBtn").addEventListener("click", async () => {
  const dojEl = document.getElementById("doj");
  if (!dojEl.value) return;
  const d = new Date(dojEl.value);
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  dojEl.value = `${yyyy}-${mm}-${dd}`;
  await fetchAndProcessData(false);
});