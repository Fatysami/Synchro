-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Hôte : dd25990-001.eu.clouddb.ovh.net:35414
-- Généré le : jeu. 06 mars 2025 à 11:47
-- Version du serveur : 8.0.40-31
-- Version de PHP : 8.2.21

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `NuxiDev2024`
--

-- --------------------------------------------------------

--
-- Structure de la table `licences2`
--

CREATE TABLE `licences2` (
  `ID` int NOT NULL,
  `IDClient` int DEFAULT NULL,
  `IdentifiantPC` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Options` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Serial` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Suspendu` tinyint(1) NOT NULL,
  `NomSoft` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `NomPoste` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `NomSession` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Date_DerUtilisation` datetime DEFAULT NULL,
  `Version` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Data1` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Data2` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP1_Hote` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP2_Hote` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP1_Identifiant` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP2_Identifiant` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP1_Mdp` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `FTP2_Mdp` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Data_Actif` int DEFAULT NULL,
  `FTP_Actif` int DEFAULT NULL,
  `URL1` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `URL2` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `IDSynchro` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `NbRun` int DEFAULT NULL,
  `Date_LimiteUtil` date DEFAULT NULL,
  `Terminaux` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `Tablettes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `MrqBlancheNum` int DEFAULT NULL,
  `Upload1` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Upload2` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Secu2Srv1` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Info` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ConfigConnecteur` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `Premium` tinyint(1) DEFAULT NULL,
  `MDP_Premium` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Autorisations_Premium` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ConfigMobile` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `DateClient` date DEFAULT NULL,
  `Partenaire` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `licences2`
--
ALTER TABLE `licences2`
  ADD PRIMARY KEY (`ID`),
  ADD KEY `IdentifiantPC` (`IdentifiantPC`),
  ADD KEY `Serial` (`Serial`),
  ADD KEY `IDSynchro` (`IDSynchro`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `licences2`
--
ALTER TABLE `licences2`
  MODIFY `ID` int NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
