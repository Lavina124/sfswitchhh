const path=require("path")
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const session = require("express-session");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax"
  }
}));


app.get("/auth/login", (req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SALESFORCE_CLIENT_ID,
    redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
    scope: "api refresh_token"
  });

  res.redirect(`${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;

    const response = await axios.post(
      `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
        code
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    req.session.salesforce = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      instanceUrl: response.data.instance_url
    };

    res.redirect(process.env.FRONTEND_URL);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Salesforce login failed");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.salesforce) {
    return res.status(401).json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    instanceUrl: req.session.salesforce.instanceUrl
  });
});

app.get("/api/validation-rules", async (req, res) => {
  try {
    if (!req.session.salesforce) {
      return res.status(401).json({ error: "Not logged in to Salesforce" });
    }

    const { accessToken, instanceUrl } = req.session.salesforce;

    const entityResponse = await axios.get(
      `${instanceUrl}/services/data/v60.0/tooling/query`,
      {
        params: {
          q: "SELECT DurableId FROM EntityDefinition WHERE QualifiedApiName = 'Account'"
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const accountEntityId = entityResponse.data.records[0]?.DurableId;

    if (!accountEntityId) {
      return res.status(404).json({ error: "Account object not found" });
    }

    const listResponse = await axios.get(
      `${instanceUrl}/services/data/v60.0/tooling/query`,
      {
        params: {
          q: `SELECT Id, ValidationName, Active, Description FROM ValidationRule WHERE EntityDefinitionId = '${accountEntityId}' ORDER BY ValidationName`
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const rules = await Promise.all(
      listResponse.data.records.map(async (rule) => {
        const metadataResponse = await axios.get(
          `${instanceUrl}/services/data/v60.0/tooling/query`,
          {
            params: {
             q: `SELECT Id, FullName, Metadata FROM ValidationRule WHERE Id = '${rule.Id}'`

            },
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const metadata = metadataResponse.data.records[0]?.Metadata || {};

        return {
          Id: rule.Id,
          FullName: metadataResponse.data.records[0]?.FullName,
          ValidationName: rule.ValidationName,
          Active: rule.Active,
          Description: rule.Description,
          ErrorConditionFormula: metadata.errorConditionFormula || "",
          ErrorMessage: metadata.errorMessage || "",
          Metadata: metadata
        };
      })
    );

    res.json(rules);
  } catch (error) {
    console.error(JSON.stringify(error.response?.data || error.message, null, 2));
    res.status(500).json({
      error: "Failed to fetch validation rules",
      details: error.response?.data || error.message
    });
  }
});
app.post("/api/validation-rules/deploy", async (req, res) => {
  try {
    if (!req.session.salesforce) {
      return res.status(401).json({ error: "Not logged in to Salesforce" });
    }

    const { accessToken, instanceUrl } = req.session.salesforce;
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: "rules must be an array" });
    }

    const results = await Promise.all(
      rules.map(async (rule) => {
        const metadata = {
          ...rule.Metadata,
          active: rule.Active
        };

        await axios.patch(
          `${instanceUrl}/services/data/v60.0/tooling/sobjects/ValidationRule/${rule.Id}`,
          {
            Metadata: metadata
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          }
        );

        return {
          Id: rule.Id,
          ValidationName: rule.ValidationName,
          Active: rule.Active,
          success: true
        };
      })
    );

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error(JSON.stringify(error.response?.data || error.message, null, 2));
    res.status(500).json({
      error: "Failed to deploy validation rule changes",
      details: error.response?.data || error.message
    });
  }
});
app.use(express.static(path.join(__dirname, "frontend", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});


app.listen(process.env.PORT, () => {
  console.log(`Backend running on port ${process.env.PORT}`);
});
