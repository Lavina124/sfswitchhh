import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "";

function App() {
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);

  const login = () => {
    window.location.href = `${API_BASE}/auth/login`;
  };

  const checkLogin = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/me`, {
        withCredentials: true
      });
      setUser(res.data);
    } catch {
      setUser({ loggedIn: false });
    }
  };

  const getValidationRules = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/validation-rules`, {
        withCredentials: true
      });
      setRules(res.data.map((rule) => ({ ...rule, changed: false })));
    } catch (error) {
      console.error(error);
      alert("Failed to get validation rules");
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (id) => {
    setRules((prevRules) =>
      prevRules.map((rule) =>
        rule.Id === id
          ? { ...rule, Active: !rule.Active, changed: true }
          : rule
      )
    );
  };

  const enableAll = () => {
    setRules((prevRules) =>
      prevRules.map((rule) => ({
        ...rule,
        Active: true,
        changed: true
      }))
    );
  };

  const disableAll = () => {
    setRules((prevRules) =>
      prevRules.map((rule) => ({
        ...rule,
        Active: false,
        changed: true
      }))
    );
  };

  const deployChanges = async () => {
    try {
      const changedRules = rules.filter((rule) => rule.changed);

      if (changedRules.length === 0) {
        alert("No changes to deploy");
        return;
      }

      setLoading(true);

      await axios.post(
        `${API_BASE}/api/validation-rules/deploy`,
        { rules: changedRules },
        { withCredentials: true }
      );

      alert("Changes deployed to Salesforce");

      setRules((prevRules) =>
        prevRules.map((rule) => ({ ...rule, changed: false }))
      );
    } catch (error) {
      console.error(error);
      alert("Failed to deploy changes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkLogin();
  }, []);

  return (
    <div className="page">
      <h1>Salesforce Validation Rule Switch</h1>

      {!user?.loggedIn ? (
        <button onClick={login}>Login with Salesforce</button>
      ) : (
        <>
          <p>Connected to: {user.instanceUrl}</p>

          <div className="actions">
            <button onClick={getValidationRules} disabled={loading}>
              {loading ? "Loading..." : "Get Validation Rules"}
            </button>

            <button onClick={enableAll} disabled={rules.length === 0 || loading}>
              Enable All
            </button>

            <button onClick={disableAll} disabled={rules.length === 0 || loading}>
              Disable All
            </button>

            <button onClick={deployChanges} disabled={rules.length === 0 || loading}>
              Deploy Changes
            </button>
          </div>

          <div className="rules">
            {rules.map((rule) => (
              <div className="rule-card" key={rule.Id}>
                <h3>{rule.ValidationName}</h3>

                <p>
                  Status:{" "}
                  <strong>{rule.Active ? "Active" : "Inactive"}</strong>
                </p>

                <button onClick={() => toggleRule(rule.Id)} disabled={loading}>
                  {rule.Active ? "Disable" : "Enable"}
                </button>

                {rule.changed && <p className="pending">Pending change</p>}

                <p>{rule.ErrorMessage}</p>

                <pre>{rule.ErrorConditionFormula}</pre>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
